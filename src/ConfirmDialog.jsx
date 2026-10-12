import { useEffect, useRef } from "react";
import Icon from "./Icon.jsx";

// The site's own confirmation window. It replaces the browser's confirm(), which on phones shows
// the website address and English "OK / Cancel" buttons.
// - "Annuler" has the focus when it opens (the safe choice), Tab stays inside the window.
// - Esc and a tap outside the window cancel.
// - The focus goes back to the button that opened it.
export default function ConfirmDialog({ title, message, confirmLabel = "Confirmer", danger = false, onConfirm, onCancel }) {
  const panelRef = useRef(null);
  const cancelRef = useRef(null);

  useEffect(() => {
    const opener = document.activeElement;
    cancelRef.current?.focus();
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden"; // the page behind doesn't scroll while the window is open
    return () => {
      document.body.style.overflow = overflow;
      if (opener && typeof opener.focus === "function" && document.contains(opener)) opener.focus();
    };
  }, []);

  function onKeyDown(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
      return;
    }
    if (e.key !== "Tab") return;
    const buttons = panelRef.current.querySelectorAll("button");
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === panelRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  const button = {
    flex: "1 1 0", minWidth: 0, minHeight: 48, padding: "0 16px", borderRadius: 12, fontSize: 16, fontWeight: 700,
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer",
  };

  return (
    <div
      className="dialog-backdrop"
      data-testid="confirm-dialog"
      onMouseDown={e => { if (e.target === e.currentTarget) onCancel(); }}
      onKeyDown={onKeyDown}
      style={{
        position: "fixed", inset: 0, zIndex: 2000, background: "rgba(10, 31, 71, 0.55)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
      }}
    >
      <div
        ref={panelRef}
        className="dialog-panel"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        tabIndex={-1}
        style={{
          width: "100%", maxWidth: 400, background: "#fff", borderRadius: 20, padding: "24px 20px 20px",
          boxShadow: "0 24px 64px rgba(10, 31, 71, 0.28)", textAlign: "center", outline: "none",
        }}
      >
        <div style={{
          width: 52, height: 52, borderRadius: "50%", margin: "0 auto 14px", display: "flex", alignItems: "center", justifyContent: "center",
          background: danger ? "#fef2f2" : "#ecfdf3", color: danger ? "#dc2626" : "#15803d",
        }}>
          <Icon name={danger ? "trash" : "checkCircle"} size={24} />
        </div>
        <h2 id="confirm-dialog-title" style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 800, color: "#0d2f6e", lineHeight: 1.3 }}>{title}</h2>
        {message && <p id="confirm-dialog-message" style={{ margin: "0 0 22px", fontSize: 15, lineHeight: 1.5, color: "#5b6478" }}>{message}</p>}
        <div style={{ display: "flex", gap: 10 }}>
          <button
            ref={cancelRef}
            type="button"
            className="hov-soft"
            onClick={onCancel}
            style={{ ...button, background: "#fff", color: "#0d2f6e", border: "1px solid #cfd5e1" }}
          >
            Annuler
          </button>
          <button
            type="button"
            className="hov-dim"
            onClick={onConfirm}
            style={{ ...button, background: danger ? "#dc2626" : "#15803d", color: "#fff", border: "1px solid transparent" }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
