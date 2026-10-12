import { useEffect, useRef } from "react";
import Icon from "./Icon.jsx";

// "Choisir la devise" (like Booking.com): a sheet from the bottom on phones, a small window on computers.
// groups = [{ title, options: [{ code, symbol, name }] }]. Picking a currency calls onPick(code) at once.
// Esc, a tap outside or the ✕ close it; the focus goes back to the header button.
export default function CurrencySheet({ groups, current, onPick, onClose, isMobile, note }) {
  const panelRef = useRef(null);

  useEffect(() => {
    const opener = document.activeElement;
    const panel = panelRef.current;
    (panel.querySelector('[aria-checked="true"]') || panel.querySelector('[role="radio"]'))?.focus();
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      if (opener && typeof opener.focus === "function" && document.contains(opener)) opener.focus();
    };
  }, []);

  function onKeyDown(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }
    const panel = panelRef.current;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      const radios = [...panel.querySelectorAll('[role="radio"]')];
      const i = radios.indexOf(document.activeElement);
      if (i === -1) return;
      e.preventDefault();
      radios[(i + (e.key === "ArrowDown" ? 1 : radios.length - 1)) % radios.length].focus();
      return;
    }
    if (e.key !== "Tab") return;
    const items = [...panel.querySelectorAll("button, a[href]")];
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === panel)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={onKeyDown}
      style={{
        position: "fixed", inset: 0, zIndex: 2000, background: "rgba(10, 31, 71, 0.5)",
        display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", padding: isMobile ? 0 : 16,
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="currency-sheet-title"
        tabIndex={-1}
        className={isMobile ? "sheet-panel" : "dialog-panel"}
        data-testid="currency-sheet"
        style={{
          width: "100%", maxWidth: isMobile ? "none" : 420, maxHeight: "85vh", overflowY: "auto", background: "#fff", outline: "none",
          borderRadius: isMobile ? "22px 22px 0 0" : 20, boxShadow: "0 24px 64px rgba(10, 31, 71, 0.28)",
          padding: isMobile ? "8px 16px calc(16px + env(safe-area-inset-bottom))" : "18px 20px 20px",
        }}
      >
        {isMobile && <div aria-hidden="true" style={{ width: 40, height: 4, borderRadius: 2, background: "#d5dae3", margin: "2px auto 10px" }} />}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 6 }}>
          <h2 id="currency-sheet-title" style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "#0d2f6e" }}>Choisir la devise</h2>
          <button
            type="button"
            aria-label="Fermer"
            onClick={onClose}
            className="hov-soft"
            style={{ width: 44, height: 44, borderRadius: 12, border: "none", background: "transparent", color: "#0d2f6e", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}
          >
            <Icon name="close" size={22} />
          </button>
        </div>
        {groups.map(group => (
          <div key={group.title} role="radiogroup" aria-label={group.title} style={{ marginTop: 10 }}>
            <p style={{ margin: "0 0 4px", fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#5b6478" }}>{group.title}</p>
            {group.options.map(o => {
              const selected = o.code === current;
              return (
                <button
                  key={o.code}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={`${o.code} – ${o.name}`}
                  onClick={() => onPick(o.code)}
                  className="hov-soft"
                  style={{
                    display: "flex", alignItems: "center", gap: 14, width: "100%", minHeight: 56, padding: "6px 10px", margin: "2px 0",
                    border: selected ? "2px solid #0d2f6e" : "2px solid transparent", borderRadius: 14,
                    background: selected ? "#f1f4f9" : "transparent", textAlign: "left", color: "#14213d", fontFamily: "inherit",
                  }}
                >
                  <span aria-hidden="true" style={{ width: 40, height: 40, borderRadius: 12, background: "#e9edf3", color: "#0d2f6e", fontWeight: 800, fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{o.symbol}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 16, fontWeight: 700 }}>{o.code}</span>
                    <span style={{ display: "block", fontSize: 14, color: "#5b6478" }}>{o.name}</span>
                  </span>
                  {selected && <span style={{ color: "#15803d" }}><Icon name="checkCircle" size={22} /></span>}
                </button>
              );
            })}
          </div>
        ))}
        {note && <p style={{ margin: "14px 2px 0", fontSize: 13, lineHeight: 1.45, color: "#5b6478" }}>{note}</p>}
      </div>
    </div>
  );
}
