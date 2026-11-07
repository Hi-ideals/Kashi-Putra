import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Dropdown action menu rendered in a portal, so it is never clipped by
 * scrolling tables. Opens below the button, or above it when there is no room.
 * items: [{ icon, label, fn, danger?, divider? }]
 */
export default function ActionMenu({ items, label = 'Actions', size = 'sm', align = 'end' }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const menuRef = useRef(null);

  const place = () => {
    const b = btnRef.current?.getBoundingClientRect();
    const m = menuRef.current;
    if (!b || !m) return;
    const mh = m.offsetHeight; const mw = m.offsetWidth;
    const spaceBelow = window.innerHeight - b.bottom;
    const up = spaceBelow < mh + 12 && b.top > spaceBelow;
    let left = align === 'end' ? b.right - mw : b.left;
    left = Math.max(8, Math.min(left, window.innerWidth - mw - 8));
    const top = up ? Math.max(8, b.top - mh - 6) : Math.min(b.bottom + 6, window.innerHeight - mh - 8);
    setPos({ top, left, up });
  };

  useLayoutEffect(() => { if (open) place(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (menuRef.current?.contains(e.target) || btnRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    const onScroll = () => setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open]);

  return (
    <>
      <button ref={btnRef} type="button" className={`btn btn-${size} action-menu-btn ${open ? 'open' : ''}`} onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
        {label} <i className={`bi bi-chevron-${open ? 'up' : 'down'} ms-1`} />
      </button>
      {open && createPortal(
        <div ref={menuRef} className={`action-menu ${pos?.up ? 'up' : ''}`} role="menu" style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}>
          {items.map((it, i) => (it.divider
            ? <div key={`d${i}`} className="action-menu-divider" />
            : (
              <button key={it.label} type="button" role="menuitem" className={`action-menu-item ${it.danger ? 'danger' : ''}`}
                onClick={() => { setOpen(false); it.fn(); }}>
                <i className={`bi bi-${it.icon}`} /><span>{it.label}</span>
              </button>
            )))}
        </div>,
        document.body
      )}
    </>
  );
}
