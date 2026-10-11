import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useConvexConnectionState } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { categories } from "../convex/categories";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Card } from "./components/ui/card";

const storageKey = "eliott-family-token";
function newToken() { return Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, "0")).join(""); }
function initialAccess() {
  const params = new URLSearchParams(location.hash.slice(1));
  const edit = params.get("edit"); const admin = params.get("admin");
  if (edit && /^[a-f0-9]{64}$/.test(edit)) localStorage.setItem(storageKey, edit);
  if (admin && /^[a-f0-9]{64}$/.test(admin)) sessionStorage.setItem("eliott-admin", admin);
  if (edit || admin) history.replaceState(null, "", location.pathname + location.search);
  let token = localStorage.getItem(storageKey);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) { token = newToken(); localStorage.setItem(storageKey, token); }
  return { token, admin: sessionStorage.getItem("eliott-admin") ?? "" };
}
const access = initialAccess();
function message(error: unknown) { return error instanceof ConvexError ? String(error.data) : "L’enregistrement a échoué. Vérifie ta connexion puis réessaie."; }
type ChoiceMap = Record<string, string>;
function useBoard() { return useQuery(api.meal.board); }
type Board = NonNullable<ReturnType<typeof useBoard>>;

export default function App() {
  const board = useBoard(); const mine = useQuery(api.meal.mine, { token: access.token });
  const save = useMutation(api.meal.save); const connection = useConvexConnectionState();
  const [name, setName] = useState(""); const [guests, setGuests] = useState("1");
  const [comment, setComment] = useState(""); const [choices, setChoices] = useState<ChoiceMap>({});
  const [initialized, setInitialized] = useState(false); const [busy, setBusy] = useState(false);
  const [error, setError] = useState(""); const [saved, setSaved] = useState(false);
  const [onlyAvailable, setOnlyAvailable] = useState(false); const [showAdmin, setShowAdmin] = useState(Boolean(access.admin));
  const [copyState, setCopyState] = useState("");
  useEffect(() => {
    if (mine === undefined || initialized) return;
    if (mine) { setName(mine.family.name); setGuests(String(mine.family.guests)); setComment(mine.family.comment); setChoices(Object.fromEntries(mine.choices.map(c => [c.slotId, c.dish]))); }
    setInitialized(true);
  }, [mine, initialized]);
  function dirty() { setSaved(false); setError(""); }
  async function submit(e: FormEvent) {
    e.preventDefault(); setError(""); setBusy(true); setSaved(false);
    try { await save({ token: access.token, name, guests: Number(guests), comment, choices: Object.entries(choices).map(([slotId, dish]) => ({ slotId: slotId as Id<"slots">, dish })) }); setSaved(true); }
    catch (err) { setError(message(err)); } finally { setBusy(false); }
  }
  const editUrl = `${location.origin}${location.pathname}#edit=${access.token}`;
  const taken = board?.slots.filter(s => s.familyId).length ?? 0;
  const guestCount = board?.families.reduce((n, f) => n + f.guests, 0) ?? 0;
  return <>
    <header className="topbar"><a className="wordmark" href={location.pathname}>Eliott <span>18</span></a><span className="topbar-note">LE REPAS PARTAGÉ</span><a href="#tableau">Qui apporte quoi ? ↗</a></header>
    <main><section className="hero" aria-labelledby="title"><div className="hero-copy"><p className="eyebrow">SAMEDI 31 OCTOBRE 2026 · 12 H 30 – 18 H 30</p><h1 id="title">18 ans.<br/>Tous à <span>table !</span></h1><p className="intro">On fête Eliott autour d’une auberge espagnole.<br/>Un petit quelque chose de chacun, un grand repas ensemble.</p><div className="hero-details"><span>43 convives prévus</span><span>17 familles, couples ou personnes</span></div></div><div className="plate" aria-hidden="true"><div className="plate-inner"><span>ELIOTT</span><strong>18</strong><em>ça se fête !</em></div><span className="plate-star">✳</span></div></section>
      <div className="live-strip"><span><i className={connection.isWebSocketConnected ? "live-dot" : "live-dot offline"}/>{connection.isWebSocketConnected ? "Tableau partagé en direct" : "Connexion en cours…"}</span><span>{board ? `${taken} / ${board.slots.length} contributions choisies` : "Chargement du tableau…"}</span></div>
      {!connection.isWebSocketConnected && connection.hasEverConnected && <p className="notice" role="status">Connexion interrompue : tes saisies restent à l’écran. Attends la reconnexion avant de valider.</p>}
      {showAdmin && access.admin && board ? <Admin token={access.admin} board={board} onClose={() => setShowAdmin(false)}/> : <>
      <form onSubmit={submit}><Card className="identity"><div><p className="eyebrow">POUR COMMENCER</p><h2>Qui vient à table ?</h2><p>Une seule réponse pour toute votre famille.</p></div><div className="identity-fields"><label htmlFor="name">Ton prénom / votre famille<Input id="name" autoComplete="name" placeholder="Ex. Sophie et sa famille" required maxLength={80} value={name} disabled={busy || !initialized} onChange={e => { setName(e.target.value); dirty(); }}/></label><label htmlFor="guests">Vous serez combien ?<Input id="guests" type="number" inputMode="numeric" min={1} max={43} required value={guests} disabled={busy || !initialized} onChange={e => { setGuests(e.target.value); dirty(); }}/><small>Toi compris·e</small></label></div>{mine && <p className="return-note">Ta réponse est retrouvée. Tu peux modifier votre présence et vos contributions ci-dessous.</p>}</Card>
        <section id="tableau" className="board-section" aria-labelledby="board-title"><div className="section-heading"><div><p className="eyebrow">À CHACUN SA SPÉCIALITÉ</p><h2 id="board-title">Qui apporte quoi ?</h2><p>Regarde ce qui est déjà prévu, puis choisis une place libre.</p></div><label className="filter"><input type="checkbox" checked={onlyAvailable} onChange={e => setOnlyAvailable(e.target.checked)}/> Seulement les places libres</label></div>
          {board === undefined ? <div className="loading" role="status">On prépare la table…</div> : <div className="category-grid">{categories.map(category => {
            const slots = board.slots.filter(s => s.category === category.key); const filled = slots.filter(s => s.familyId).length;
            if (onlyAvailable && !slots.some(s => !s.familyId || s.familyId === mine?.family.id)) return null;
            return <Card key={category.key} className="category"><div className="category-top"><span className="food-icon" aria-hidden="true">{category.icon}</span><span className={`place-count ${filled === slots.length ? "complete" : ""}`}>{filled === slots.length ? "Complet" : `${slots.length - filled} place${slots.length - filled > 1 ? "s" : ""} libre${slots.length - filled > 1 ? "s" : ""}`}</span></div><h3>{category.title}</h3><p className="instruction">{category.instruction}</p><div className="slots">{slots.map(slot => {
              const own = Boolean(mine && slot.familyId === mine.family.id); const selected = Object.prototype.hasOwnProperty.call(choices, slot.id); const unavailable = Boolean(slot.familyId && !own);
              return <div key={slot.id} className={`slot ${unavailable ? "taken" : selected ? "selected" : "available"}`}>{unavailable ? <><span className="slot-check" aria-hidden="true">✓</span><div><strong>{slot.name}</strong><p>{slot.dish}</p>{selected && <p className="conflict">Cette place vient d’être prise.</p>}</div>{selected && <Button type="button" variant="ghost" onClick={() => { setChoices(prev => { const next = { ...prev }; delete next[slot.id]; return next; }); dirty(); }}>Retirer</Button>}</> : <><label className="slot-choice"><input type="checkbox" aria-label={`${category.title} : place ${slot.position + 1}`} checked={selected} disabled={busy || !initialized} onChange={e => { setChoices(prev => { const next = { ...prev }; if (e.target.checked) next[slot.id] = slot.dish; else delete next[slot.id]; return next; }); dirty(); }}/><span>{selected ? "Je m’en occupe !" : "Je prends cette place"}</span>{own && <small>Ta contribution</small>}</label>{selected && <label className="dish-label" htmlFor={`dish-${slot.id}`}>Ce que tu apportes<Input id={`dish-${slot.id}`} placeholder={category.key === "dessert" ? "Ex. gâteau au chocolat" : "Ta spécialité…"} value={choices[slot.id]} required maxLength={180} disabled={busy} onChange={e => { setChoices(prev => ({ ...prev, [slot.id]: e.target.value })); dirty(); }}/></label>}</>}</div>;
            })}</div></Card>;
          })}</div>}
        </section>
        <Card className="finish"><div><label htmlFor="comment"><h3>Un petit mot pour les organisateurs ?</h3></label><p>Facultatif. Ce message reste réservé aux organisateurs.</p><textarea id="comment" placeholder="Une précision sur votre contribution…" maxLength={500} value={comment} disabled={busy} onChange={e => { setComment(e.target.value); dirty(); }}/></div><div className="save-panel"><p><strong>{Object.keys(choices).length} contribution{Object.keys(choices).length > 1 ? "s" : ""}</strong><br/>{guests || "0"} personne{Number(guests) > 1 ? "s" : ""} dans votre famille</p><Button className="primary-button" type="submit" disabled={busy || !initialized || !board || !connection.isWebSocketConnected}>{busy ? "Enregistrement…" : mine ? "Enregistrer mes modifications" : "Enregistrer notre participation"} ↗</Button><small>Les places sont réservées à la validation.</small></div></Card>
        {error && <p role="alert" className="notice error">{error}</p>}
        {saved && <Card className="success" role="status"><h3>C’est enregistré, {name} !</h3><p>Votre famille compte pour {guests} personne{Number(guests) > 1 ? "s" : ""}. Merci de participer au repas d’Eliott.</p><p>Conserve ton lien personnel pour revenir modifier votre réponse, même depuis un autre appareil. Ce lien permet de modifier votre inscription : garde-le pour vous.</p><div className="copy-row"><Input aria-label="Ton lien personnel de modification" readOnly value={editUrl}/><Button type="button" variant="outline" onClick={async () => { try { await navigator.clipboard.writeText(editUrl); setCopyState("Lien copié !"); } catch { setCopyState("Sélectionne puis copie le lien ci-dessus."); } }}>Copier le lien</Button></div><small>{copyState}</small></Card>}
      </form>
      {board && <section className="participants"><div><p className="eyebrow">ON SE RETROUVE BIENTÔT</p><h2>Déjà autour de la table</h2><p>{board.families.length} réponse{board.families.length > 1 ? "s" : ""} · {guestCount} convive{guestCount > 1 ? "s" : ""} confirmé{guestCount > 1 ? "s" : ""}</p></div><div className="family-tags">{board.families.length ? board.families.map(f => <span key={f.id}>{f.name}<small>{f.guests} pers.</small></span>) : <p>La table attend ses premières contributions. À toi de jouer !</p>}</div></section>}
      </>}
      <footer><span>Eliott, 18 ans · Fait pour se retrouver.</span><span>v0.1.0</span><button type="button" onClick={() => setShowAdmin(true)}>Organisateurs</button></footer>
      {showAdmin && !access.admin && <AdminLogin onClose={() => setShowAdmin(false)}/>}
    </main></>;
}

function AdminLogin({ onClose }: { onClose: () => void }) {
  const [token, setToken] = useState("");
  return <Card className="admin-login"><h2>Accès organisateurs</h2><p>Utilise le lien privé remis aux organisateurs ou sa clé d’accès.</p><form onSubmit={e => { e.preventDefault(); if (/^[a-f0-9]{64}$/.test(token)) { sessionStorage.setItem("eliott-admin", token); location.reload(); } }}><Input aria-label="Clé organisateur" type="password" required pattern="[a-f0-9]{64}" value={token} onChange={e => setToken(e.target.value)} autoComplete="off"/><Button type="submit">Ouvrir les résultats</Button><Button type="button" variant="ghost" onClick={onClose}>Fermer</Button></form></Card>;
}
function csvCell(value: unknown) { const text = String(value ?? ""); return `"${(/^[=+@\-\t\r]/.test(text) ? "'" : "") + text.replace(/"/g, '""')}"`; }
function Admin({ token, board, onClose }: { token: string; board: Board; onClose: () => void }) {
  const families = useQuery(api.meal.adminResults, { token });
  const update = useMutation(api.meal.adminUpdate); const cancel = useMutation(api.meal.adminCancel);
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{ id: Id<"families">; name: string; guests: number; comment: string; choices: { slotId: Id<"slots">; dish: string }[] } | null>(null);
  const [cancelId, setCancelId] = useState<Id<"families"> | null>(null);
  async function adminSave(e: FormEvent) { e.preventDefault(); if (!editing) return; setBusy(true); setError(""); try { await update({ token, ...editing }); setEditing(null); } catch (err) { setError(message(err)); } finally { setBusy(false); } }
  function exportCsv() {
    if (!families) return;
    const rows: unknown[][] = [["Prénom / famille", "Convives", "Catégorie", "Contribution", "Message organisateurs"]];
    for (const f of families) { const slots = board.slots.filter(s => s.familyId === f.id); if (!slots.length) rows.push([f.name, f.guests, "", "", f.comment]); for (const s of slots) rows.push([f.name, f.guests, categories.find(c => c.key === s.category)?.title, s.dish, f.comment]); }
    const url = URL.createObjectURL(new Blob(["\uFEFF" + rows.map(r => r.map(csvCell).join(";")).join("\r\n")], { type: "text/csv;charset=utf-8" })); const link = document.createElement("a"); link.href = url; link.download = "repas-eliott-contributions.csv"; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section className="admin"><div className="section-heading"><div><p className="eyebrow">ESPACE ORGANISATEURS</p><h2>Le repas en un coup d’œil</h2><p>{families?.length ?? "…"} familles · {families?.reduce((n, f) => n + f.guests, 0) ?? "…"} convives confirmés</p></div><div className="admin-actions"><Button onClick={exportCsv} disabled={!families}>Télécharger le CSV</Button><Button variant="outline" onClick={onClose}>Voir le formulaire</Button><Button variant="ghost" onClick={() => { sessionStorage.removeItem("eliott-admin"); location.reload(); }}>Déconnexion</Button></div></div><p className="notice">Les places sont strictement limitées. Leur ouverture à des contributions supplémentaires reste à décider.</p>{error && <p className="notice error" role="alert">{error}</p>}
      {families === null ? <p className="notice error" role="alert">Ce lien organisateur est invalide. Déconnecte-toi puis utilise le lien privé qui t’a été remis.</p> : families === undefined ? <p>Chargement des résultats…</p> : families.length === 0 ? <Card className="empty-state">Aucune réponse pour le moment. Partage le lien public du formulaire pour commencer.</Card> : <div className="admin-list">{families.map(f => <Card key={f.id} className="admin-family"><div><h3>{f.name}</h3><p>{f.guests} personne{f.guests > 1 ? "s" : ""}</p></div><ul>{board.slots.filter(s => s.familyId === f.id).map(s => <li key={s.id}><strong>{categories.find(c => c.key === s.category)?.title}</strong> — {s.dish}</li>)}</ul>{f.comment && <p className="private-note">Message : {f.comment}</p>}<div className="admin-actions"><Button variant="outline" disabled={busy} onClick={() => setEditing({ id: f.id, name: f.name, guests: f.guests, comment: f.comment, choices: board.slots.filter(s => s.familyId === f.id).map(s => ({ slotId: s.id, dish: s.dish })) })}>Modifier la famille</Button><Button variant="ghost" disabled={busy} onClick={() => setCancelId(f.id)}>Annuler l’inscription</Button></div>{cancelId === f.id && <div className="notice"><p>Annuler la réponse de {f.name} et libérer ses places ?</p><Button type="button" disabled={busy} onClick={async () => { setBusy(true); setError(""); try { await cancel({ token, id: f.id }); setCancelId(null); } catch (err) { setError(message(err)); } finally { setBusy(false); } }}>Confirmer l’annulation</Button><Button type="button" variant="ghost" onClick={() => setCancelId(null)}>Garder l’inscription</Button></div>}</Card>)}</div>}
      {editing && <Card className="admin-edit"><h3>Modifier la famille</h3><form onSubmit={adminSave}><label>Prénom / famille<Input required maxLength={80} value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })}/></label><label>Nombre de convives<Input type="number" min={1} max={43} required value={editing.guests} onChange={e => setEditing({ ...editing, guests: Number(e.target.value) })}/></label><label>Message<textarea value={editing.comment} maxLength={500} onChange={e => setEditing({ ...editing, comment: e.target.value })}/></label>{editing.choices.map((choice, i) => <label key={choice.slotId}>Contribution {i + 1}<Input required maxLength={180} value={choice.dish} onChange={e => setEditing({ ...editing, choices: editing.choices.map((c, n) => n === i ? { ...c, dish: e.target.value } : c) })}/></label>)}<div className="admin-actions"><Button disabled={busy} type="submit">Enregistrer</Button><Button type="button" variant="ghost" onClick={() => setEditing(null)}>Fermer</Button></div></form></Card>}
    </section>;
}
