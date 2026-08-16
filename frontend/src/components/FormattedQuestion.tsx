import React from "react";

interface FormattedQuestionProps {
  content: string;
  style?: React.CSSProperties;
  fontSize?: string;
}

export default function FormattedQuestion({ content, style, fontSize = "1rem" }: FormattedQuestionProps) {
  if (!content) return null;

  // Clean raw LaTeX formatting like \text{...} or \mathrm{...}
  const cleanLatex = (str: string) => {
    return str
      .replace(/\\mathrm\{([^}]+)\}/g, "$1")
      .replace(/\\text\{([^}]+)\}/g, "$1")
      .replace(/\\mathbf\{([^}]+)\}/g, "$1")
      .replace(/\$+/g, "");
  };

  // Helper to parse inline formatting (**bold**, LaTeX, etc.)
  const renderInline = (text: string) => {
    // Split by bold (**bold**)
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return (
          <strong key={i} style={{ color: "var(--text-primary)", fontWeight: 700 }}>
            {cleanLatex(part.slice(2, -2))}
          </strong>
        );
      }
      return <span key={i}>{cleanLatex(part)}</span>;
    });
  };

  // Parse lines into text paragraphs and tables
  const lines = content.split("\n");
  const blocks: Array<{ type: "text" | "table"; lines: string[] }> = [];
  let currentBlock: { type: "text" | "table"; lines: string[] } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const isTableLine = line.startsWith("|") && line.endsWith("|");

    if (isTableLine) {
      if (!currentBlock || currentBlock.type !== "table") {
        if (currentBlock) blocks.push(currentBlock);
        currentBlock = { type: "table", lines: [line] };
      } else {
        currentBlock.lines.push(line);
      }
    } else {
      if (!currentBlock || currentBlock.type !== "text") {
        if (currentBlock) blocks.push(currentBlock);
        currentBlock = { type: "text", lines: [lines[i]] };
      } else {
        currentBlock.lines.push(lines[i]);
      }
    }
  }
  if (currentBlock) blocks.push(currentBlock);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px", fontSize, ...style }}>
      {blocks.map((block, bIdx) => {
        if (block.type === "text") {
          const text = block.lines.join("\n").trim();
          if (!text) return null;
          return (
            <div
              key={bIdx}
              style={{
                lineHeight: "1.65",
                whiteSpace: "pre-wrap",
                color: "var(--text-primary)",
                fontWeight: 500
              }}
            >
              {renderInline(text)}
            </div>
          );
        }

        if (block.type === "table") {
          // Parse table header, separator, and rows
          const tableLines = block.lines;
          if (tableLines.length === 0) return null;

          const parseRow = (rowStr: string) => {
            return rowStr
              .split("|")
              .slice(1, -1)
              .map((c) => c.trim());
          };

          const headerCols = parseRow(tableLines[0]);
          let rowStartIndex = 1;
          // Check if second line is separator | :--- | :--- |
          if (tableLines.length > 1 && tableLines[1].includes("---")) {
            rowStartIndex = 2;
          }

          const rows = tableLines.slice(rowStartIndex).map(parseRow);

          return (
            <div
              key={bIdx}
              style={{
                margin: "12px 0",
                overflowX: "auto",
                borderRadius: "8px",
                border: "1px solid var(--border-color)",
                backgroundColor: "rgba(0, 0, 0, 0.25)",
                boxShadow: "0 2px 10px rgba(0,0,0,0.15)"
              }}
            >
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  textAlign: "left",
                  fontSize: "0.95rem"
                }}
              >
                <thead>
                  <tr style={{ backgroundColor: "rgba(99, 102, 241, 0.12)", borderBottom: "1px solid var(--border-color)" }}>
                    {headerCols.map((h, hIdx) => (
                      <th
                        key={hIdx}
                        style={{
                          padding: "12px 16px",
                          fontWeight: 700,
                          color: "var(--primary)",
                          letterSpacing: "0.02em",
                          borderRight: hIdx < headerCols.length - 1 ? "1px solid var(--border-color)" : "none"
                        }}
                      >
                        {renderInline(h)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, rIdx) => (
                    <tr
                      key={rIdx}
                      style={{
                        borderBottom: rIdx < rows.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none",
                        backgroundColor: rIdx % 2 === 1 ? "rgba(255,255,255,0.015)" : "transparent"
                      }}
                    >
                      {r.map((cell, cIdx) => (
                        <td
                          key={cIdx}
                          style={{
                            padding: "10px 16px",
                            color: "var(--text-primary)",
                            verticalAlign: "top",
                            borderRight: cIdx < r.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none"
                          }}
                        >
                          {renderInline(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        return null;
      })}
    </div>
  );
}
