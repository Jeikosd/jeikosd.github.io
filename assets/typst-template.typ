// CV layout for the PDF built from cv.qmd.
#let accent = rgb("#1f6f78")
#let ink = rgb("#23272c")
#let soft = rgb("#555a60")

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
  set document(title: "Jeison Mesa Diez, CV", author: "Jeison Mesa Diez")
  set page(numbering: none)
  set text(lang: lang, region: region, size: fontsize, fill: ink)
  set text(font: font) if font != none
  set par(justify: false, leading: 0.5em, spacing: 0.62em)
  set list(indent: 0.4em, body-indent: 0.5em, spacing: 0.42em, marker: text(fill: accent)[•])

  show link: set text(fill: accent)

  show heading: set block(sticky: true)
  // Quarto shifts Markdown headings up one level: ## is level 1 here, ### is level 2.
  show heading.where(level: 1): it => {
    set text(font: "Newsreader", size: 13.5pt, weight: 500, fill: accent)
    block(above: 1.05em, below: 0.5em, width: 100%)[
      #it.body
      #v(-0.62em)
      #line(length: 100%, stroke: 0.5pt + rgb("#c9d3d4"))
    ]
  }
  show heading.where(level: 2): it => {
    set text(size: 10.2pt, weight: 600, fill: ink)
    block(above: 0.8em, below: 0.42em, width: 100%, it.body)
  }

  if title != none {
    block(below: 0.75em, text(font: "Newsreader", size: 24pt, weight: 400, fill: ink, title))
  }
  if subtitle != none {
    block(below: 0.5em, text(size: 10.5pt, fill: soft, subtitle))
  }
  doc
}
