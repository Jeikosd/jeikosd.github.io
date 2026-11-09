-- Puts the "dates" attribute of a .cv-role heading on the same line as the role:
-- pushed to the right margin in the PDF, as a small span on the web page.
function Header(el)
  if not el.classes:includes("cv-role") then return nil end
  local dates = el.attributes["dates"]
  if dates == nil then return nil end
  el.attributes["dates"] = nil
  if quarto.doc.is_format("typst") then
    el.content:insert(pandoc.RawInline("typst", '#h(1fr)#text(size: 9pt, weight: "regular", fill: rgb("#62676d"))[' .. dates .. "]"))
  else
    el.content:insert(pandoc.Space())
    el.content:insert(pandoc.Span(pandoc.Str(dates), pandoc.Attr("", { "cv-dates" })))
  end
  return el
end
