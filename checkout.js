/**
 * FICHIER : checkout.js
 * Rôle : Gère la redirection sécurisée vers Stripe via l'extension Firebase
 */

export async function lancerPaiement(db, userId, priceId) {
    // 1. Vérification de sécurité : l'utilisateur doit être logué
    if (!userId) {
        alert("Veuillez vous connecter pour effectuer un achat.");
        // Optionnel : rediriger vers la page de connexion
        // window.location.href = "compte.html"; 
        return;
    }

    if (!priceId) {
        alert("Erreur : Ce service n'a pas d'identifiant de prix Stripe.");
        return;
    }

    try {
        console.log("Tentative de paiement pour le prix :", priceId);

        // 2. Création de la session dans Firestore
        // On cible : customers / {userId} / checkout_sessions
        const docRef = await db
            .collection("customers")
            .doc(userId)
            .collection("checkout_sessions")
            .add({
                price: priceId,
                success_url: window.location.origin + "/success.html",
                cancel_url: window.location.origin + "/erreur.html",
                mode: "payment", // Ou "subscription" si c'est un abonnement
            });

        // 3. Écoute du document pour récupérer l'URL générée par l'extension
        docRef.onSnapshot((snap) => {
            const data = snap.data();
            
            if (data) {
                const { url, error } = data;

                if (error) {
                    // Si l'extension rencontre un problème (ex: ID de prix invalide)
                    console.error("Erreur renvoyée par l'extension Stripe :", error.message);
                    alert("Une erreur est survenue lors de la création de la session Stripe.");
                }

                if (url) {
                    // Redirection vers la page de paiement sécurisée de Stripe
                    console.log("URL de paiement reçue, redirection...");
                    window.location.assign(url);
                }
            }
        });

    } catch (err) {
        console.error("Erreur lors de la création du document de session :", err);
        alert("Impossible de contacter le service de paiement.");
    }
}