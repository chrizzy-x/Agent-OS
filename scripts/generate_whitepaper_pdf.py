#!/usr/bin/env python3
"""Generate the official AgentOS whitepaper PDF from the canonical web content."""

from __future__ import annotations

import json
import re
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab import rl_config

rl_config.invariant = 1
rl_config.pageCompression = 1

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    HRFlowable,
    ListFlowable,
    ListItem,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

ROOT = Path(__file__).resolve().parents[1]
CONTENT_DIR = ROOT / "app" / "whitepaper" / "content"
OUTPUT = ROOT / "docs" / "AgentOS_Whitepaper_v1.0_July_2026.pdf"
PAGE_W, PAGE_H = A4

REPLACEMENTS = {
    "\u2018": "'",
    "\u2019": "'",
    "\u201c": '"',
    "\u201d": '"',
    "\u2013": "-",
    "\u2014": "-",
    "\u2026": "...",
    "\u00a0": " ",
    "\u2192": "->",
    "\u2265": ">=",
    "\u2264": "<=",
}


def ascii_text(value: str) -> str:
    for source, target in REPLACEMENTS.items():
        value = value.replace(source, target)
    return value.encode("ascii", "ignore").decode("ascii")


def inline_markup(value: str) -> str:
    value = ascii_text(value).strip()
    value = escape(value)
    value = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", value)
    value = re.sub(r"`(.+?)`", r"<font name='Courier'>\1</font>", value)
    return value


def load_markdown() -> str:
    parts: list[str] = []
    for path in sorted(CONTENT_DIR.glob("part-*.ts")):
        source = path.read_text(encoding="utf-8").strip()
        match = re.fullmatch(r"export default (.+);", source, flags=re.DOTALL)
        if not match:
            raise RuntimeError(f"Invalid whitepaper content part: {path}")
        parts.append(json.loads(match.group(1)))
    if not parts:
        raise RuntimeError("No whitepaper content parts found")
    return "".join(parts)


styles = getSampleStyleSheet()
styles.add(
    ParagraphStyle(
        name="CoverBrand",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=18,
        leading=22,
        textColor=colors.HexColor("#5C4ACB"),
        alignment=TA_CENTER,
        spaceAfter=10,
    )
)
styles.add(
    ParagraphStyle(
        name="CoverTitle",
        parent=styles["Title"],
        fontName="Helvetica-Bold",
        fontSize=38,
        leading=40,
        textColor=colors.HexColor("#111827"),
        alignment=TA_CENTER,
        spaceAfter=14,
    )
)
styles.add(
    ParagraphStyle(
        name="CoverSubtitle",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=15,
        leading=22,
        textColor=colors.HexColor("#4B5563"),
        alignment=TA_CENTER,
        spaceAfter=18,
    )
)
styles.add(
    ParagraphStyle(
        name="H1x",
        parent=styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=22,
        leading=27,
        textColor=colors.HexColor("#111827"),
        spaceBefore=15,
        spaceAfter=10,
        keepWithNext=True,
    )
)
styles.add(
    ParagraphStyle(
        name="H2x",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=15,
        leading=20,
        textColor=colors.HexColor("#3F35A5"),
        spaceBefore=12,
        spaceAfter=7,
        keepWithNext=True,
    )
)
styles.add(
    ParagraphStyle(
        name="H3x",
        parent=styles["Heading3"],
        fontName="Helvetica-Bold",
        fontSize=11.5,
        leading=15,
        textColor=colors.HexColor("#272B35"),
        spaceBefore=9,
        spaceAfter=5,
        keepWithNext=True,
    )
)
styles.add(
    ParagraphStyle(
        name="Bodyx",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=9.2,
        leading=13.2,
        textColor=colors.HexColor("#303644"),
        spaceAfter=7,
    )
)
styles.add(
    ParagraphStyle(
        name="Smallx",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=7.4,
        leading=10,
        textColor=colors.HexColor("#374151"),
    )
)
styles.add(
    ParagraphStyle(
        name="Callout",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=8.8,
        leading=12.5,
        textColor=colors.HexColor("#303644"),
        leftIndent=10,
        rightIndent=8,
        borderColor=colors.HexColor("#7667E8"),
        borderWidth=1,
        borderPadding=9,
        backColor=colors.HexColor("#F7F6FF"),
        spaceBefore=5,
        spaceAfter=8,
    )
)


def footer(canvas, doc) -> None:
    canvas.saveState()
    canvas.setStrokeColor(colors.HexColor("#E5E7EB"))
    canvas.setLineWidth(0.5)
    canvas.line(18 * mm, 15 * mm, PAGE_W - 18 * mm, 15 * mm)
    canvas.setFont("Helvetica", 7.3)
    canvas.setFillColor(colors.HexColor("#7A8190"))
    canvas.drawString(18 * mm, 10 * mm, "AgentOS Whitepaper v1.0 - July 2026")
    canvas.drawRightString(PAGE_W - 18 * mm, 10 * mm, str(doc.page))
    canvas.restoreState()


def is_table_separator(cells: list[str]) -> bool:
    return bool(cells) and all(re.fullmatch(r":?-{3,}:?", cell.strip()) for cell in cells)


def table_from(lines: list[str]) -> Table:
    rows: list[list[str]] = []
    for line in lines:
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        if is_table_separator(cells):
            continue
        rows.append(cells)
    width = max(len(row) for row in rows)
    for row in rows:
        row.extend([""] * (width - len(row)))
    data = [[Paragraph(inline_markup(cell), styles["Smallx"]) for cell in row] for row in rows]
    table = Table(data, colWidths=[(PAGE_W - 36 * mm) / width] * width, repeatRows=1, hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#EEECFF")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#302783")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#D7DAE3")),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#FAFAFC")]),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    return table


def build_story(markdown: str) -> list[object]:
    story: list[object] = [
        Spacer(1, 31 * mm),
        Paragraph("AGENTOS", styles["CoverBrand"]),
        Paragraph("Whitepaper", styles["CoverTitle"]),
        Paragraph("The Operating Ecosystem for Autonomous Intelligence", styles["CoverSubtitle"]),
        HRFlowable(width="58%", thickness=2, color=colors.HexColor("#7667E8"), spaceBefore=4, spaceAfter=18),
        Paragraph(
            "A unified command, context, capability, execution, security and distribution layer for people, builders and intelligent systems.",
            styles["CoverSubtitle"],
        ),
        Spacer(1, 18 * mm),
    ]
    flow = Table(
        [[Paragraph(item, styles["Smallx"]) for item in ["UNDERSTAND", "PLAN", "AUTHORIZE", "EXECUTE", "VERIFY", "DELIVER"]]],
        colWidths=[(PAGE_W - 36 * mm) / 6] * 6,
    )
    flow.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F2F0FF")),
                ("TEXTCOLOR", (0, 0), (-1, -1), colors.HexColor("#4B3FBA")),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#D8D3FF")),
                ("INNERGRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#E5E1FF")),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ]
        )
    )
    story.extend(
        [
            flow,
            Spacer(1, 22 * mm),
            Paragraph("One command. Super AgentOS coordinates the work end to end.", styles["CoverSubtitle"]),
            PageBreak(),
        ]
    )

    lines = markdown.splitlines()
    index = 0
    paragraph: list[str] = []

    def flush_paragraph() -> None:
        if paragraph:
            story.append(Paragraph(inline_markup(" ".join(paragraph)), styles["Bodyx"]))
            paragraph.clear()

    while index < len(lines):
        raw = lines[index]
        line = raw.strip()
        if not line:
            flush_paragraph()
            index += 1
            continue
        if line.startswith("|"):
            flush_paragraph()
            table_lines: list[str] = []
            while index < len(lines) and lines[index].strip().startswith("|"):
                table_lines.append(lines[index].strip())
                index += 1
            story.extend([table_from(table_lines), Spacer(1, 7)])
            continue
        if line.startswith(">"):
            flush_paragraph()
            quote: list[str] = []
            while index < len(lines) and (not lines[index].strip() or lines[index].strip().startswith(">")):
                value = lines[index].strip()
                if value.startswith(">"):
                    quote.append(value[1:].strip())
                index += 1
            story.append(Paragraph(inline_markup(" ".join(part for part in quote if part)), styles["Callout"]))
            continue
        heading = re.match(r"^(#{1,3})\s+(.+)$", line)
        if heading:
            flush_paragraph()
            style = {1: "H1x", 2: "H2x", 3: "H3x"}[len(heading.group(1))]
            story.append(Paragraph(inline_markup(heading.group(2)), styles[style]))
            index += 1
            continue
        if re.match(r"^-\s+", line):
            flush_paragraph()
            items: list[ListItem] = []
            while index < len(lines) and re.match(r"^-\s+", lines[index].strip()):
                text = re.sub(r"^-\s+", "", lines[index].strip())
                items.append(ListItem(Paragraph(inline_markup(text), styles["Bodyx"]), leftIndent=13))
                index += 1
                while index < len(lines) and not lines[index].strip():
                    index += 1
            story.append(ListFlowable(items, bulletType="bullet", leftIndent=16, bulletFontSize=6))
            story.append(Spacer(1, 4))
            continue
        numbered = re.match(r"^(\d+)\.\s+(.+)$", line)
        if numbered:
            flush_paragraph()
            items = []
            while index < len(lines):
                match = re.match(r"^(\d+)\.\s+(.+)$", lines[index].strip())
                if not match:
                    break
                items.append(ListItem(Paragraph(inline_markup(match.group(2)), styles["Bodyx"]), leftIndent=15))
                index += 1
                while index < len(lines) and not lines[index].strip():
                    index += 1
            story.append(ListFlowable(items, bulletType="1", start=numbered.group(1), leftIndent=18))
            story.append(Spacer(1, 4))
            continue
        paragraph.append(line)
        index += 1

    flush_paragraph()
    return story


def main() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    frame = Frame(18 * mm, 18 * mm, PAGE_W - 36 * mm, PAGE_H - 34 * mm, id="normal")
    document = BaseDocTemplate(
        str(OUTPUT),
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=18 * mm,
        bottomMargin=18 * mm,
        title="AgentOS Whitepaper v1.0",
        author="AgentOS",
    )
    document.addPageTemplates([PageTemplate(id="all", frames=frame, onPage=footer)])
    document.build(build_story(load_markdown()))
    print(OUTPUT)


if __name__ == "__main__":
    main()
