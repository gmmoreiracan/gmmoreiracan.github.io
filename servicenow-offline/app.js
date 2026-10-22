(function () {
  const input = document.getElementById("record-search");
  const cards = Array.from(document.querySelectorAll(".record-card"));
  const empty = document.getElementById("search-empty");
  if (!input || !cards.length) return;

  function filter() {
    const query = input.value.trim().toLowerCase();
    let visible = 0;
    cards.forEach(function (card) {
      const haystack = (card.innerText + " " + (card.dataset.search || "")).toLowerCase();
      const match = !query || haystack.includes(query);
      card.hidden = !match;
      if (match) visible += 1;
    });
    if (empty) empty.hidden = visible !== 0;
  }

  input.addEventListener("input", filter);
  document.addEventListener("keydown", function (event) {
    if (event.key === "/" && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) {
      event.preventDefault();
      input.focus();
    }
    if (event.key === "Escape" && document.activeElement === input) {
      input.value = "";
      filter();
      input.blur();
    }
  });
})();
