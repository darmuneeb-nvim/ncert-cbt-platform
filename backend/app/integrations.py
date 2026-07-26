import logging
import json
import requests
import httpx
from typing import List, Dict, Any, Optional
from .config import settings

logger = logging.getLogger(__name__)

def clean_tag(val: Optional[str]) -> str:
    """Helper to sanitize text values into Anki-compatible tag formats (replacing spaces with underscores)."""
    if not val:
        return "unknown"
    # Anki tags can't contain spaces. Replace with underscores.
    return re.sub(r'[^a-zA-Z0-9_:]', '', val.replace(" ", "_"))

import re

# ==========================================
# ANKI INTEGRATION (AnkiConnect Local API)
# ==========================================

def verify_anki_connection() -> bool:
    """Checks if Anki is open and AnkiConnect is accessible."""
    try:
        response = requests.post(
            settings.anki_connect_url,
            json={"action": "version", "version": 6},
            timeout=2
        )
        return response.status_code == 200 and response.json().get("error") is None
    except Exception:
        return False

def push_to_anki(
    question_text: str,
    options: Optional[List[str]],
    correct_answer: str,
    explanation: Optional[str],
    subject: Optional[str],
    chapter: Optional[str],
    concept: Optional[str],
    difficulty: Optional[str]
) -> bool:
    """Pushes a wrong question to Anki via the local AnkiConnect HTTP API."""
    if not verify_anki_connection():
        logger.warning(f"AnkiConnect not reachable at {settings.anki_connect_url}. Skipping sync.")
        return False

    # 1. Create the target deck if it doesn't exist
    deck_name = settings.anki_deck_name
    try:
        requests.post(
            settings.anki_connect_url,
            json={"action": "createDeck", "version": 6, "params": {"deck": deck_name}}
        )
    except Exception as e:
        logger.error(f"Failed to verify/create Anki deck: {str(e)}")
        return False

    # 2. Format HTML content
    options_html = ""
    if options:
        options_html = "<ul style='list-style-type: upper-alpha; padding-left: 20px; text-align: left;'>"
        for opt in options:
            options_html += f"<li style='margin-bottom: 6px;'>{opt}</li>"
        options_html += "</ul>"

    front_html = f"""
    <div style='font-family: Arial, sans-serif; font-size: 16px; color: #1e293b; line-height: 1.5; padding: 10px;'>
        <div style='font-weight: bold; margin-bottom: 12px;'>Question:</div>
        <div style='background-color: #f8fafc; border-left: 4px solid #6366f1; padding: 12px; margin-bottom: 15px; border-radius: 4px;'>
            {question_text}
        </div>
        {options_html}
    </div>
    """

    back_html = f"""
    <div style='font-family: Arial, sans-serif; font-size: 16px; color: #1e293b; line-height: 1.5; padding: 10px;'>
        <div style='font-weight: bold; color: #10b981; margin-bottom: 10px;'>Correct Answer: {correct_answer}</div>
        {f"<div style='margin-top: 10px; border-top: 1px solid #e2e8f0; padding-top: 10px; color: #475569;'><strong>Explanation:</strong> {explanation}</div>" if explanation else ""}
    </div>
    """

    # Build Tags list (using hierarchical nested structure)
    anki_tags = []
    if subject:
        anki_tags.append(clean_tag(subject))
        if chapter:
            anki_tags.append(f"{clean_tag(subject)}::{clean_tag(chapter)}")
            if concept:
                anki_tags.append(f"{clean_tag(subject)}::{clean_tag(chapter)}::{clean_tag(concept)}")
    if difficulty:
        anki_tags.append(f"difficulty::{clean_tag(difficulty)}")

    note_payload = {
        "action": "addNote",
        "version": 6,
        "params": {
            "note": {
                "deckName": deck_name,
                "modelName": "Basic",
                "fields": {
                    "Front": front_html,
                    "Back": back_html
                },
                "tags": anki_tags
            }
        }
    }

    try:
        res = requests.post(settings.anki_connect_url, json=note_payload)
        res_data = res.json()
        if res_data.get("error"):
            logger.error(f"AnkiConnect returned error: {res_data.get('error')}")
            return False
        logger.info(f"Successfully pushed question note to Anki (ID: {res_data.get('result')})")
        return True
    except Exception as e:
        logger.error(f"Failed to push to Anki: {str(e)}")
        return False


# ==========================================
# NOTION INTEGRATION (Public Notion API)
# ==========================================

async def push_to_notion(
    question_text: str,
    options: Optional[List[str]],
    correct_answer: str,
    subject: Optional[str],
    chapter: Optional[str],
    difficulty: Optional[str]
) -> bool:
    """Pushes a skipped question to Notion via the Notion REST API."""
    token = settings.notion_token
    db_id = settings.notion_database_id

    if not token or not db_id:
        logger.warning("Notion credentials (token/database ID) are missing. Notion sync skipped.")
        return False

    url = "https://api.notion.com/v1/pages"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Notion-Version": "2022-06-28"
    }

    # Prepare standard properties mapping. 
    # Properties should match user's db structure. We'll send standard ones.
    properties = {
        "Name": {
            "title": [
                {
                    "text": {
                        "content": question_text[:2000]  # Notion title limit
                    }
                }
            ]
        }
    }

    if subject:
        properties["Subject"] = {"select": {"name": subject}}
    if chapter:
        properties["Chapter"] = {"select": {"name": chapter[:100]}}  # select limit
    if difficulty:
        properties["Difficulty"] = {"select": {"name": difficulty.capitalize()}}
    if correct_answer:
        properties["Correct Answer"] = {
            "rich_text": [{"text": {"content": correct_answer}}]
        }

    # Convert options list to string
    options_str = ""
    if options:
        options_str = "\n".join(options)

    # Notion page children blocks for full details
    children = [
        {
            "object": "block",
            "type": "heading_3",
            "heading_3": {
                "rich_text": [{"text": {"content": "Question Options"}}]
            }
        },
        {
            "object": "block",
            "type": "paragraph",
            "paragraph": {
                "rich_text": [{"text": {"content": options_str or "No options provided."}}]
            }
        }
    ]

    payload = {
        "parent": {"database_id": db_id},
        "properties": properties,
        "children": children
    }

    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(url, json=payload, headers=headers)
            if response.status_code == 200:
                logger.info("Successfully pushed skipped question to Notion.")
                return True
            else:
                logger.error(f"Notion API error (Status {response.status_code}): {response.text}")
                return False
        except Exception as e:
            logger.error(f"Failed to push to Notion: {str(e)}")
            return False
