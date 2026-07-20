/**
 * Règles simples anti-contournement (paiement / coordonnées hors plateforme).
 * Complément côté produit — pas un filtre juridique exhaustif.
 */
(function (global) {
    var BLOCK = [
        "hors plateforme",
        "sans passer par needs",
        "payez en dehors",
        "paypal.me",
        "virement direct",
        "western union",
        "moneygram",
        "lydia",
        "revolut",
        "envoyez en espèces",
        "uniquement en espèces",
        "whatsapp",
        "telegram",
        "signal app"
    ];

    function validateMessage(text) {
        if (!text || typeof text !== "string") return { ok: false, reason: "empty" };
        var t = text.toLowerCase();
        for (var i = 0; i < BLOCK.length; i++) {
            if (t.indexOf(BLOCK[i]) !== -1) return { ok: false, reason: "blocked", hint: BLOCK[i] };
        }
        return { ok: true };
    }

    global.needsTrust = { validateMessage: validateMessage };
})(typeof window !== "undefined" ? window : this);
