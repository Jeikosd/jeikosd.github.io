// CV layout for the PDF built from cv.qmd.
#let accent = rgb("#1f6f78")
#let ink = rgb("#1b1f24")
#let soft = rgb("#62676d")
#let rule = rgb("#e2dfd7")

#let article(
  title: none,
  subtitle: none,
  lang: "en",
  region: "US",
  font: none,
  fontsize: 9.5pt,
  ..rest,
  doc,
) = {
  set document(title: "Jeison Mesa, CV", author: "Jeison Mesa")
  set page(numbering: none)
  set text(lang: lang, region: region, size: fontsize, fill: ink)
  set text(font: font) if font != none
  set par(justify: false, leading: 0.5em, spacing: 0.95em)
  set list(indent: 0.4em, body-indent: 0.5em, spacing: 0.42em, marker: text(fill: accent)[•])

  show link: set text(fill: accent)

  show heading: set block(sticky: true)
  // Quarto shifts Markdown headings up one level: ## is level 1 here, ### is level 2.
  show heading.where(level: 1): it => {
    set text(size: 8.5pt, weight: 600, fill: soft, tracking: 0.14em)
    block(above: 1.8em, below: 0.5em, width: 100%)[
      #upper(it.body)
      #v(-0.3em)
      #line(length: 100%, stroke: 0.5pt + rule)
    ]
  }
  show heading.where(level: 2): it => {
    set text(size: 10.2pt, weight: 600, fill: ink)
    block(above: 1.2em, below: 0.35em, width: 100%, it.body)
  }

  if title != none {
    block(below: 0.75em, text(font: "Newsreader", size: 24pt, weight: 400, fill: ink, title))
  }
  if subtitle != none {
    block(below: 0.5em, text(size: 10.5pt, fill: soft, subtitle))
  }
  doc
}
