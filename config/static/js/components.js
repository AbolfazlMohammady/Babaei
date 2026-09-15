document.addEventListener("DOMContentLoaded", () => {
    const body = document.body;

    document.querySelectorAll("[data-mobile-menu]").forEach((trigger) => {
        trigger.addEventListener("click", () => {
            body.classList.toggle("no-scroll");
            document.querySelector("[data-mobile-menu-panel]")?.classList.toggle("is-open");
        });
    });

    document.querySelectorAll("[data-modal-open]").forEach((trigger) => {
        trigger.addEventListener("click", () => {
            const modal = document.querySelector(trigger.dataset.modalOpen);
            modal?.classList.add("is-open");
        });
    });

    document.querySelectorAll("[data-modal-close]").forEach((trigger) => {
        trigger.addEventListener("click", () => {
            trigger.closest(".modal")?.classList.remove("is-open");
        });
    });
});