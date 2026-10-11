import { useEffect, useState, useRef, type FormEvent } from "react";
import { useMutation, useQuery, useConvexConnectionState } from "convex/react";
import { initialAccess, newToken } from "./access";
import { ConvexError } from "convex/values";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Card } from "./components/ui/card";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./components/ui/dialog";

function message(error: unknown) { return error instanceof ConvexError ? String(error.data) : "L’enregistrement a échoué. Vérifie ta connexion puis réessaie."; }
type ChoiceMap = Record<string, string>;
function useBoard() { return useQuery(api.meal.board); }
type Board = NonNullable<ReturnType<typeof useBoard>>;

export default function App() {
  const [access, setAccess] = useState(initialAccess);
  const [showAdmin, setShowAdmin] = useState(Boolean(access.admin && !access.editing));
  const board = useBoard();
  const organizer = useQuery(api.meal.adminResults, access.admin ? { token: access.admin } : "skip");
  useEffect(() => {
    const navigate = () => {
      const params = new URLSearchParams(location.hash.slice(1));
      if (!params.has("edit") && !params.has("admin") && location.hash !== "") return;
      const next = initialAccess(); setAccess(next); setShowAdmin(Boolean(next.admin && !next.editing));
    };
    window.addEventListener("hashchange", navigate);
    return () => window.removeEventListener("hashchange", navigate);
  }, []);
  function newFamily() {
    history.replaceState(null, "", location.pathname + location.search);
    setAccess(previous => ({ ...previous, token: newToken(), editing: false, invalidEdit: false }));
    setShowAdmin(false);
  }
  return <main>{showAdmin && access.admin ? (board ? <Admin token={access.admin} board={board} onClose={() => setShowAdmin(false)}/> : <p role="status">Chargement…</p>) : access.invalidEdit ? <p className="notice error">Lien de modification invalide. <Button onClick={newFamily}>Nouvelle inscription</Button></p> : <MealForm key={access.token} token={access.token} editing={access.editing} admin={access.admin} organizer={Boolean(organizer)} board={board} onNew={newFamily} onResults={() => setShowAdmin(true)}/>}</main>;
}

function MealForm({ token, editing, admin, organizer, board, onNew, onResults }: { token: string; editing: boolean; admin: string; organizer: boolean; board: Board | undefined; onNew: () => void; onResults: () => void }) {
  const mine = useQuery(api.meal.mine, { token });
  const save = useMutation(api.meal.save); const connection = useConvexConnectionState();
  const [name, setName] = useState(""); const [guests, setGuests] = useState("1");
  const [comment, setComment] = useState(""); const [choices, setChoices] = useState<ChoiceMap>({});
  const [initialized, setInitialized] = useState(false); const [busy, setBusy] = useState(false);
  const [error, setError] = useState(""); const [saved, setSaved] = useState(false);
  const [baseVersion, setBaseVersion] = useState<number | null>(null);
  const [baseName, setBaseName] = useState("");
  const [renamePrompt, setRenamePrompt] = useState(false);
  const [copyState, setCopyState] = useState("");
  const confirmationTitle = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (mine === undefined || initialized) return;
    if (mine) { setBaseVersion(mine.family.updatedAt); setBaseName(mine.family.name); setName(mine.family.name); setGuests(String(mine.family.guests)); setComment(mine.family.comment); setChoices(Object.fromEntries(mine.choices.map(c => [c.slotId, c.dish]))); }
    setInitialized(true);
  }, [mine, initialized]);
  const stale = initialized && mine !== undefined && (baseVersion === null ? mine !== null : mine === null || mine.family.updatedAt !== baseVersion);
  const unavailableLink = editing && mine === null && baseVersion === null;
  const removed = board ? Object.keys(choices).filter(id => !board.slots.some(slot => slot.id === id)) : [];
  function loadLatest() {
    if (!mine) return;
    setBaseVersion(mine.family.updatedAt); setBaseName(mine.family.name); setName(mine.family.name); setGuests(String(mine.family.guests));
    setComment(mine.family.comment); setChoices(Object.fromEntries(mine.choices.map(c => [c.slotId, c.dish]))); setError(""); setSaved(false);
  }
  function dirty() { setSaved(false); setError(""); }
  function submit(e: FormEvent) {
    e.preventDefault(); if (busy || stale || unavailableLink || removed.length) return;
    if (baseVersion !== null && name.trim() !== baseName) { setRenamePrompt(true); return; }
    void persist();
  }
  async function persist() {
    if (busy || stale || unavailableLink || removed.length) return;
    setError(""); setBusy(true); setSaved(false);
    try {
      const result = await save({ token, expectedUpdatedAt: baseVersion, name, guests: Number(guests), comment, choices: Object.entries(choices).map(([slotId, dish]) => ({ slotId: slotId as Id<"slots">, dish })) });
      setBaseVersion(result.updatedAt); setBaseName(name.trim()); history.replaceState(null, "", `${location.pathname}${location.search}#edit=${token}`); setSaved(true);
    } catch (err) { setError(message(err)); } finally { setBusy(false); }
  }
  const editUrl = `${location.origin}${location.pathname}#edit=${token}`;
  return <>
      {!connection.isWebSocketConnected && connection.hasEverConnected && <p className="notice" role="status">Connexion interrompue : attends la reconnexion avant d’enregistrer.</p>}
      <div className="admin-toolbar">{organizer && <Button type="button" variant="outline" onClick={onResults}>Résultats</Button>}{baseVersion !== null && <><span className="editing-label">Modification de l’inscription : {mine?.family.name ?? name}</span><Button type="button" variant="outline" disabled={busy} onClick={onNew}>Inscrire une autre famille</Button></>}</div>
      {unavailableLink && <p className="notice error">Cette inscription n’existe plus. <Button type="button" onClick={onNew}>Nouvelle inscription</Button></p>}
      {stale && <div className="notice error" role="alert"><p>Cette inscription a été modifiée ailleurs{mine ? ". Charge la dernière version avant d’enregistrer ; elle remplacera ta saisie actuelle." : " ou annulée."}</p>{mine ? <Button type="button" onClick={loadLatest}>Charger la dernière version</Button> : <Button type="button" onClick={onNew}>Nouvelle inscription</Button>}</div>}
      <p className="intro">Pour l’instant, si tout le monde participe au repas, nous serons 43 convives ! 😊 Voici un tableau à remplir pour répartir les différentes contributions au repas entre les 17 personnes/ couples /familles qui participent à son organisation. Chacun peut choisir ce qu’il souhaite apporter et inscrire son prénom directement dans le tableau. Merci à tous pour votre participation ! 😊</p>
      <form onSubmit={submit}>
        <Card className="identity"><div className="identity-fields"><label htmlFor="name">Nom ou famille<Input id="name" autoComplete="name" required maxLength={80} value={name} disabled={busy || !initialized} onChange={e => { setName(e.target.value); dirty(); }}/></label><label htmlFor="guests">Combien serez-vous ?<Input id="guests" type="number" inputMode="numeric" min={1} max={43} required value={guests} disabled={busy || !initialized} onChange={e => { setGuests(e.target.value); dirty(); }}/></label></div></Card>
        <section id="tableau" className="board-section" aria-label="Contributions au repas">
          {board === undefined ? <div className="loading" role="status">Chargement…</div> : <div className="category-grid">{board.categories.map(category => {
            const slots = board.slots.filter(s => s.category === category.key);
            return <Card key={category.key} className="category">{organizer && <CategoryEditor token={admin} category={category}/>}<h3>{category.title}</h3><p className="instruction">{category.instruction}</p><div className="slots">{slots.map(slot => {
              const own = Boolean(mine && slot.familyId === mine.family.id); const selected = Object.prototype.hasOwnProperty.call(choices, slot.id); const unavailable = Boolean(slot.familyId && !own);
              return <div key={slot.id} className={`slot ${unavailable ? "taken" : selected ? "selected" : "available"}`}>{unavailable ? <><span className="slot-check" aria-hidden="true">✓</span><div><strong>{slot.name}</strong><p>{slot.dish}</p>{selected && <p className="conflict">Cette place vient d’être prise.</p>}</div>{selected && <Button type="button" variant="ghost" onClick={() => { setChoices(prev => { const next = { ...prev }; delete next[slot.id]; return next; }); dirty(); }}>Retirer</Button>}</> : <><label className="slot-choice"><input type="checkbox" aria-label={`${category.title} : place ${slot.position + 1}`} checked={selected} disabled={busy || !initialized} onChange={e => { setChoices(prev => { const next = { ...prev }; if (e.target.checked) next[slot.id] = slot.dish; else delete next[slot.id]; return next; }); dirty(); }}/><span>{selected ? name.trim() || "Votre contribution" : "Place libre"}</span></label>{selected && <label className="dish-label" htmlFor={`dish-${slot.id}`}>Contribution<Input id={`dish-${slot.id}`} value={choices[slot.id]} required maxLength={180} disabled={busy} onChange={e => { setChoices(prev => ({ ...prev, [slot.id]: e.target.value })); dirty(); }}/></label>}</>}</div>;
            })}</div></Card>;
          })}</div>}
        </section>
        {removed.length > 0 && <div className="notice error" role="alert"><p>Une place sélectionnée a été supprimée par les organisateurs. Les autres saisies sont conservées.</p><Button type="button" onClick={() => { setChoices(previous => Object.fromEntries(Object.entries(previous).filter(([id]) => !removed.includes(id)))); dirty(); }}>Retirer les places supprimées</Button></div>}
        <div className="finish"><details className="comment"><summary>Message aux organisateurs</summary><textarea id="comment" aria-label="Message aux organisateurs" maxLength={500} value={comment} disabled={busy} onChange={e => { setComment(e.target.value); dirty(); }}/></details><Button className="primary-button" type="submit" disabled={busy || !initialized || !board || !connection.isWebSocketConnected || stale || unavailableLink || removed.length > 0}>{busy ? "Enregistrement…" : "Enregistrer"}</Button></div>
        {error && <p role="alert" className="notice error">{error}</p>}
        <Dialog open={saved} onOpenChange={setSaved}><DialogContent className="save-confirmation" onOpenAutoFocus={e => { e.preventDefault(); confirmationTitle.current?.focus(); }}><span className="confirmation-check" aria-hidden="true">✓</span><DialogTitle ref={confirmationTitle} tabIndex={-1} className="confirmation-title">Votre contribution est enregistrée.</DialogTitle><DialogDescription>Gardez ce lien privé pour modifier votre réponse.</DialogDescription><div className="copy-row"><Input aria-label="Ton lien personnel de modification" readOnly value={editUrl}/><Button type="button" variant="outline" onClick={async () => { try { await navigator.clipboard.writeText(editUrl); setCopyState("Lien copié !"); } catch { setCopyState("Sélectionne puis copie le lien ci-dessus."); } }}>Copier le lien</Button></div><small role="status">{copyState}</small><Button type="button" className="primary-button" onClick={onNew}>Inscrire une autre famille</Button><Button type="button" variant="outline" onClick={() => setSaved(false)}>Fermer</Button></DialogContent></Dialog>
        <Dialog open={renamePrompt} onOpenChange={setRenamePrompt}><DialogContent><DialogTitle>Modifier l’inscription de {baseName} ?</DialogTitle><DialogDescription>Pour inscrire quelqu’un d’autre, créez une nouvelle inscription. Renommer cette inscription remplace son nom actuel.</DialogDescription><Button type="button" onClick={onNew}>Inscrire une autre famille</Button><Button type="button" variant="outline" onClick={() => { setRenamePrompt(false); void persist(); }}>Renommer cette inscription</Button><Button type="button" variant="ghost" onClick={() => setRenamePrompt(false)}>Annuler</Button></DialogContent></Dialog>
      </form>
    </>;
}

function csvCell(value: unknown) { const text = String(value ?? ""); return `"${(/^[=+@\-\t\r]/.test(text) ? "'" : "") + text.replace(/"/g, '""')}"`; }
function Admin({ token, board, onClose }: { token: string; board: Board; onClose: () => void }) {
  const families = useQuery(api.meal.adminResults, { token });
  const update = useMutation(api.meal.adminUpdate); const cancel = useMutation(api.meal.adminCancel);
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{ id: Id<"families">; expectedUpdatedAt: number; name: string; guests: number; comment: string; choices: { slotId: Id<"slots">; dish: string }[] } | null>(null);
  const [cancelId, setCancelId] = useState<{ id: Id<"families">; version: number } | null>(null);
  const editingStale = Boolean(editing && families && families.find(f => f.id === editing.id)?.updatedAt !== editing.expectedUpdatedAt);
  async function adminSave(e: FormEvent) { e.preventDefault(); if (!editing || editingStale || busy) return; setBusy(true); setError(""); try { await update({ token, ...editing }); setEditing(null); } catch (err) { setError(message(err)); } finally { setBusy(false); } }
  function exportCsv() {
    if (!families) return;
    const rows: unknown[][] = [["Nom ou famille", "Convives", "Catégorie", "Contribution", "Message organisateurs"]];
    for (const f of families) { const slots = board.slots.filter(s => s.familyId === f.id); if (!slots.length) rows.push([f.name, f.guests, "", "", f.comment]); for (const s of slots) rows.push([f.name, f.guests, board.categories.find(c => c.key === s.category)?.title, s.dish, f.comment]); }
    const url = URL.createObjectURL(new Blob(["\uFEFF" + rows.map(r => r.map(csvCell).join(";")).join("\r\n")], { type: "text/csv;charset=utf-8" })); const link = document.createElement("a"); link.href = url; link.download = "repas-eliott-contributions.csv"; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section className="admin" aria-label="Résultats du repas"><div className="admin-toolbar"><Button onClick={exportCsv} disabled={!families}>Télécharger le CSV</Button><Button variant="outline" onClick={onClose}>Formulaire</Button><Button variant="ghost" onClick={() => { sessionStorage.removeItem("eliott-admin"); location.reload(); }}>Déconnexion</Button></div>{error && <p className="notice error" role="alert">{error}</p>}
      {families === null ? <p className="notice error" role="alert">Ce lien organisateur est invalide. Déconnecte-toi puis utilise le lien privé qui t’a été remis.</p> : families === undefined ? <p>Chargement des résultats…</p> : families.length === 0 ? <Card className="empty-state">Aucune réponse pour le moment.</Card> : <div className="admin-list">{families.map(f => <Card key={f.id} className="admin-family"><div><h3>{f.name}</h3><p>{f.guests} personne{f.guests > 1 ? "s" : ""}</p></div><ul>{board.slots.filter(s => s.familyId === f.id).map(s => <li key={s.id}><strong>{board.categories.find(c => c.key === s.category)?.title}</strong> — {s.dish}</li>)}</ul>{f.comment && <p className="private-note">Message : {f.comment}</p>}<div className="admin-actions"><Button variant="outline" disabled={busy} onClick={() => setEditing({ id: f.id, expectedUpdatedAt: f.updatedAt, name: f.name, guests: f.guests, comment: f.comment, choices: board.slots.filter(s => s.familyId === f.id).map(s => ({ slotId: s.id, dish: s.dish })) })}>Modifier</Button><Button variant="ghost" disabled={busy} onClick={() => setCancelId({ id: f.id, version: f.updatedAt })}>Annuler l’inscription</Button></div>{cancelId?.id === f.id && <div className="notice"><p>Annuler la réponse de {f.name} et libérer ses places ?</p><Button type="button" disabled={busy} onClick={async () => { setBusy(true); setError(""); try { await cancel({ token, id: f.id, expectedUpdatedAt: cancelId.version }); setCancelId(null); } catch (err) { setError(message(err)); } finally { setBusy(false); } }}>Confirmer l’annulation</Button><Button type="button" variant="ghost" onClick={() => setCancelId(null)}>Garder l’inscription</Button></div>}</Card>)}</div>}
      {editing && <Card className="admin-edit"><h3>Modifier</h3>{editingStale && <div className="notice error" role="alert"><p>Cette inscription a été modifiée ou annulée depuis l’ouverture de l’éditeur.</p>{families?.find(f => f.id === editing.id) ? <Button type="button" onClick={() => { const current = families?.find(f => f.id === editing.id); if (current) { setEditing({ id: current.id, expectedUpdatedAt: current.updatedAt, name: current.name, guests: current.guests, comment: current.comment, choices: board.slots.filter(s => s.familyId === current.id).map(s => ({ slotId: s.id, dish: s.dish })) }); setError(""); } }}>Charger la dernière version</Button> : <Button type="button" onClick={() => setEditing(null)}>Fermer</Button>}</div>}<form onSubmit={adminSave}><label>Nom ou famille<Input required maxLength={80} value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })}/></label><label>Nombre de convives<Input type="number" min={1} max={43} required value={editing.guests} onChange={e => setEditing({ ...editing, guests: Number(e.target.value) })}/></label><label>Message<textarea value={editing.comment} maxLength={500} onChange={e => setEditing({ ...editing, comment: e.target.value })}/></label>{editing.choices.map((choice, i) => <div className="edit-contribution" key={choice.slotId}><label>{board.categories.find(c => c.key === board.slots.find(s => s.id === choice.slotId)?.category)?.title ?? `Contribution ${i + 1}`}<Input required maxLength={180} disabled={busy} value={choice.dish} onChange={e => setEditing({ ...editing, choices: editing.choices.map((c, n) => n === i ? { ...c, dish: e.target.value } : c) })}/></label><Button type="button" variant="outline" disabled={busy} onClick={() => setEditing({ ...editing, choices: editing.choices.filter(c => c.slotId !== choice.slotId) })}>Retirer</Button></div>)}<div className="admin-actions"><Button disabled={busy || editingStale} type="submit">Enregistrer</Button><Button type="button" variant="ghost" onClick={() => setEditing(null)}>Fermer</Button></div></form></Card>}
    </section>;
}

function CategoryEditor({ token, category }: { token: string; category: Board["categories"][number] }) {
  const configure = useMutation(api.meal.adminConfigureCategory);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(category.title);
  const [instruction, setInstruction] = useState(category.instruction);
  const [places, setPlaces] = useState(String(category.places));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function apply() {
    setBusy(true); setError("");
    try { await configure({ token, key: category.key, title, instruction, places: Number(places) }); setOpen(false); }
    catch (err) { setError(message(err)); } finally { setBusy(false); }
  }
  return <div className="category-editor" onKeyDown={e => { if (e.key === "Enter" && e.target instanceof HTMLInputElement) { e.preventDefault(); if (!busy) void apply(); } }}>
    <Button type="button" variant="ghost" onClick={() => { setTitle(category.title); setInstruction(category.instruction); setPlaces(String(category.places)); setError(""); setOpen(!open); }}>Modifier le poste</Button>
    {open && <div className="category-settings">
      <label>Intitulé<Input value={title} maxLength={100} disabled={busy} onChange={e => setTitle(e.target.value)}/></label>
      <label>Consigne<textarea value={instruction} maxLength={500} disabled={busy} onChange={e => setInstruction(e.target.value)}/></label>
      <label>Nombre de places<Input type="number" min={1} max={20} value={places} disabled={busy} onChange={e => setPlaces(e.target.value)}/></label>
      {error && <p role="alert" className="notice error">{error}</p>}
      <div className="admin-actions"><Button type="button" disabled={busy} onClick={apply}>{busy ? "Enregistrement…" : "Enregistrer le poste"}</Button><Button type="button" variant="ghost" disabled={busy} onClick={() => setOpen(false)}>Annuler</Button></div>
    </div>}
  </div>;
}
