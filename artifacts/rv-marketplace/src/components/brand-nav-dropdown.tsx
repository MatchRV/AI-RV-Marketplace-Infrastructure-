import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { ChevronDown } from "lucide-react";

export function BrandNavDropdown({ label, id, items }: { label: string; id: string; items: { href: string; title: string; description: string }[] }) {
  const [path] = useLocation();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => { setOpen(false); }, [path]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  return <div className="brand-services" ref={root} onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
  }}>
    <button ref={trigger} className={`brand-services-trigger ${items.some(item => item.href === path) ? "active" : ""}`} aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>{label} <ChevronDown size={15} aria-hidden="true"/></button>
    <div id={id} className="brand-services-links" hidden={!open}>
      {items.map(item => <Link key={item.href} href={item.href} aria-current={path === item.href ? "page" : undefined} onClick={() => setOpen(false)}><strong>{item.title}</strong><span>{item.description}</span></Link>)}
    </div>
  </div>;
}
