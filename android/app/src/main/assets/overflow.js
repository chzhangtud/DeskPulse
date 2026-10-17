(function (root) {
  "use strict";
  const pending = new Set();
  let frame = 0;
  function schedule(element) {
    pending.add(element);
    if (!frame)
      frame = requestAnimationFrame(() => {
        frame = 0;
        for (const target of pending) {
          if (!target.isConnected || !target.firstElementChild) continue;
          const css = getComputedStyle(target);
          const available =
            target.clientWidth -
            parseFloat(css.paddingLeft) -
            parseFloat(css.paddingRight);
          const distance = target.firstElementChild.scrollWidth - available;
          const overflowing = distance > 2;
          target.classList.toggle("is-overflowing", overflowing);
          target.tabIndex = overflowing ? 0 : -1;
          target.style.setProperty("--text-pan", -Math.max(0, distance) + "px");
          target.style.setProperty(
            "--text-pan-time",
            Math.max(8, 4 + distance / 10) + "s",
          );
        }
        pending.clear();
      });
  }
  const observer =
    typeof ResizeObserver === "function"
      ? new ResizeObserver((entries) => {
          for (const entry of entries) {
            if (entry.target.isConnected) schedule(entry.target);
            else observer.unobserve(entry.target);
          }
        })
      : null;
  function set(element, value) {
    const text = String(value == null ? "" : value);
    let track = element.querySelector(".overflow-track");
    if (!track) {
      element.classList.add("overflow-text");
      track = document.createElement("span");
      track.className = "overflow-track";
      element.replaceChildren(track);
      if (observer) observer.observe(element);
    }
    if (track.textContent !== text) {
      track.textContent = text;
      element.title = text;
      element.scrollLeft = 0;
      // Restart only for a different label; stable sensor names keep their scroll progress.
      element.classList.remove("is-overflowing");
      schedule(element);
    }
  }
  root.DeskPulseOverflow = { set };
})(window);
