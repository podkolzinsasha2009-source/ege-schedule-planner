# -*- coding: utf-8 -*-
"""
Exports the full 12-page Himbiorus Schedule into a beautiful Microsoft Word (.docx) document
with color-coded tables for viewing/editing on tablets or printing.
"""

import json
import os
import sys
import re

from docx import Document
from docx.shared import Pt, RGBColor, Inches
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.section import WD_ORIENT, WD_SECTION
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import nsdecls, qn

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

DIR = r"C:\Users\podko\.gemini\antigravity\scratch\schedule-planner"

def set_cell_background(cell, hex_color):
    """Sets background color of a table cell (e.g. 'E2F2D5')"""
    shading = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{hex_color}"/>')
    cell._tc.get_or_add_tcPr().append(shading)

def set_cell_margins(cell, top=100, bottom=100, left=100, right=100):
    """Sets inner margins for a table cell in twentieths of a point"""
    tcPr = cell._tc.get_or_add_tcPr()
    tcMar = OxmlElement('w:tcMar')
    for m, val in [('top', top), ('bottom', bottom), ('left', left), ('right', right)]:
        node = OxmlElement(f'w:{m}')
        node.set(qn('w:w'), str(val))
        node.set(qn('w:type'), 'dxa')
        tcMar.append(node)
    tcPr.append(tcMar)

def main():
    js_path = os.path.join(DIR, "schedule_data.js")
    with open(js_path, "r", encoding="utf-8") as f:
        content = f.read()

    match = re.search(r'window\.COURSE_DATA\s*=\s*(\[.*\]);', content, re.DOTALL)
    if not match:
        print("Failed to load COURSE_DATA")
        return

    periods = json.loads(match.group(1))

    doc = Document()

    # Set document margins to narrow (0.5 inch)
    for section in doc.sections:
        section.top_margin = Inches(0.4)
        section.bottom_margin = Inches(0.4)
        section.left_margin = Inches(0.4)
        section.right_margin = Inches(0.4)
        section.orientation = WD_ORIENT.LANDSCAPE
        # In landscape: width 11in, height 8.5in
        section.page_width = Inches(11.0)
        section.page_height = Inches(8.5)

    # Base Styles
    normal_style = doc.styles['Normal']
    normal_style.font.name = 'Calibri'
    normal_style.font.size = Pt(8.5)

    # Title
    title_p = doc.add_paragraph()
    title_run = title_p.add_run("Годовой курс / ХимБиоРус / ЕГЭ")
    title_run.bold = True
    title_run.font.size = Pt(18)
    title_run.font.color.rgb = RGBColor(30, 41, 59)

    sub_p = doc.add_paragraph()
    sub_run = sub_p.add_run("Полное расписание подготовки (15 августа — 18 апреля). Зеленый — Биология, Сиреневый — Химия, Розовый — Русский язык.")
    sub_run.font.size = Pt(10)
    sub_run.font.color.rgb = RGBColor(100, 116, 139)

    for p_idx, period in enumerate(periods):
        # Section Header
        p_head = doc.add_paragraph()
        p_head.paragraph_format.space_before = Pt(14)
        p_head.paragraph_format.space_after = Pt(4)
        head_run = p_head.add_run(f"Период {p_idx + 1}: {period['name']}")
        head_run.bold = True
        head_run.font.size = Pt(13)
        head_run.font.color.rgb = RGBColor(79, 70, 229)

        # Days grouped by weeks (7 days each)
        day_entries = list(period["days"].items())
        weeks = [day_entries[i:i + 7] for i in range(0, len(day_entries), 7)]

        for w_idx, week_days in enumerate(weeks):
            table = doc.add_table(rows=2, cols=7)
            table.alignment = WD_TABLE_ALIGNMENT.CENTER
            table.autofit = False

            # Column widths: 10.2 inches / 7 ≈ 1.45 inches
            col_w = Inches(1.45)

            # Header row (Day names and numbers)
            hdr_cells = table.rows[0].cells
            for d_idx, (date_key, day_data) in enumerate(week_days):
                hdr = hdr_cells[d_idx]
                hdr.width = col_w
                set_cell_background(hdr, "F1F5F9")
                set_cell_margins(hdr, top=60, bottom=60, left=60, right=60)
                hp = hdr.paragraphs[0]
                hp.alignment = WD_ALIGN_PARAGRAPH.CENTER
                hrun = hp.add_run(f"{day_data['dayName']} {day_data['dayNum']} {day_data['month']}")
                hrun.bold = True
                hrun.font.size = Pt(9)
                hrun.font.color.rgb = RGBColor(15, 23, 42)

            # Fill in blank headers if week has < 7 days
            for d_idx in range(len(week_days), 7):
                hdr = hdr_cells[d_idx]
                hdr.width = col_w
                set_cell_background(hdr, "F8FAFC")

            # Content row
            content_cells = table.rows[1].cells
            for d_idx, (date_key, day_data) in enumerate(week_days):
                cell = content_cells[d_idx]
                cell.width = col_w
                set_cell_margins(cell, top=80, bottom=80, left=60, right=60)

                items = day_data["items"]
                if not items:
                    cell.paragraphs[0].text = "—"
                    cell.paragraphs[0].runs[0].font.color.rgb = RGBColor(200, 200, 200)
                    continue

                for i_idx, item in enumerate(items):
                    p = cell.paragraphs[0] if i_idx == 0 else cell.add_paragraph()
                    p.paragraph_format.space_before = Pt(2)
                    p.paragraph_format.space_after = Pt(2)

                    # Colors
                    subj = item.get("subject", "general")
                    if subj == "bio":
                        color_rgb = RGBColor(27, 77, 32)
                        bg_hex = "E2F2D5"
                    elif subj == "chem":
                        color_rgb = RGBColor(55, 27, 107)
                        bg_hex = "F0E8FF"
                    elif subj == "rus":
                        color_rgb = RGBColor(112, 20, 38)
                        bg_hex = "FEDEDF"
                    else:
                        color_rgb = RGBColor(50, 50, 50)
                        bg_hex = "F3F4F6"

                    # Format title
                    title_prefix = ""
                    if item.get("time"):
                        title_prefix += f"[{item['time']}] "
                    if item.get("isCompanion"):
                        title_prefix += "✦ "

                    run_t = p.add_run(f"{title_prefix}{item['title']}")
                    run_t.bold = True
                    run_t.font.size = Pt(7.5)
                    run_t.font.color.rgb = color_rgb

                    if item.get("subtitle"):
                        run_s = p.add_run(f"\n{item['subtitle']}")
                        run_s.font.size = Pt(6.5)
                        run_s.font.color.rgb = color_rgb

            # Spacing between weeks
            spacer = doc.add_paragraph()
            spacer.paragraph_format.space_after = Pt(4)

        # Page break after every period for clean printing
        if p_idx < len(periods) - 1:
            doc.add_page_break()

    out_file = os.path.join(DIR, "ХимБиоРус_Расписание_ЕГЭ.docx")
    doc.save(out_file)
    print(f"Successfully generated Word document: {out_file} ({os.path.getsize(out_file)} bytes)")

if __name__ == "__main__":
    main()
