export function newToken() { return Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, "0")).join(""); }
export function initialAccess() {
  const params = new URLSearchParams(location.hash.slice(1));
  const edit = params.get("edit"), admin = params.get("admin");
  const validEdit = Boolean(edit && /^[a-f0-9]{64}$/.test(edit));
  if (admin && /^[a-f0-9]{64}$/.test(admin)) sessionStorage.setItem("eliott-admin", admin);
  if (admin) history.replaceState(null, "", location.pathname + location.search);
  return { token: validEdit ? edit! : newToken(), editing: validEdit, invalidEdit: edit !== null && !validEdit, admin: sessionStorage.getItem("eliott-admin") ?? "" };
}
