(function () {
  const input = document.getElementById("ai-photo");
  const preview = document.getElementById("ai-preview");
  const result = document.getElementById("ai-result");

  if (!input || !preview || !result) return;

  input.addEventListener("change", () => {
    const file = input.files?.[0];

    if (!file) return;

    preview.src = URL.createObjectURL(file);
    preview.hidden = false;
    result.textContent = "Фото загружено. Финальная оценка выполняется на консультации специалиста.";
    result.classList.add("show");
  });
})();
