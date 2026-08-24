const form = document.querySelector("#login-form");
const submitButton = document.querySelector("#login-submit");
const errorElement = document.querySelector("#login-error");
const nextPath = safeNextPath(new URLSearchParams(location.search).get("next"));

try {
  const status = await fetch("/api/auth/status", { headers: { Accept: "application/json" }, cache: "no-store" });
  const payload = await status.json();
  if (payload.authenticated) location.replace(nextPath);
} catch {}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  submitButton.disabled = true;
  submitButton.textContent = "正在验证…";
  errorElement.hidden = true;

  try {
    const values = Object.fromEntries(new FormData(form));
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(values)
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "登录失败");
    location.replace(nextPath);
  } catch (error) {
    errorElement.textContent = error.message;
    errorElement.hidden = false;
    form.elements.password.select();
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "登录";
  }
});

function safeNextPath(value) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/admin.html";
}
