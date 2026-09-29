// Project template picker for the New-project modal (issue 43): radio cards
// with name + one-line description and an expandable file-tree preview.
import { useState } from "react";
import type { Template } from "../types";

interface Props {
  templates: Template[];
  selected: string;
  onSelect: (id: string) => void;
}

export default function TemplatePicker({ templates, selected, onSelect }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="tpl-picker" role="radiogroup" aria-label="Template">
      {templates.map((t) => {
        const sel = t.id === selected;
        return (
          <div
            key={t.id}
            className={"tpl-card" + (sel ? " sel" : "") + (openId === t.id ? " open" : "")}
            role="radio"
            aria-checked={sel}
            tabIndex={0}
            onClick={() => onSelect(t.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(t.id);
              }
            }}
          >
            <div className="tpl-head">
              <span className="tpl-radio" aria-hidden />
              <span className="tpl-name">{t.name}</span>
              {t.default && <span className="muted">(default)</span>}
            </div>
            <div className="tpl-desc">{t.description}</div>
            <button
              type="button"
              className="tpl-files-btn"
              onClick={(e) => {
                e.stopPropagation();
                setOpenId(openId === t.id ? null : t.id);
              }}
            >
              {openId === t.id ? "− hide files" : `+ ${t.files.length} files`}
            </button>
            {openId === t.id && (
              <div className="tpl-files">
                {t.files.join("\n")}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
