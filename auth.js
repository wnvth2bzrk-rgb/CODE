// Configuration Firebase
const firebaseConfig = {
    apiKey: "AIzaSyAQQSVZx38jeI-8-OL-sfaDSxElqrOTJOU",
    authDomain: "needs-ae86d.firebaseapp.com",
    projectId: "needs-ae86d",
    storageBucket: "needs-ae86d.firebasestorage.app",
    messagingSenderId: "253900994407",
    appId: "1:253900994407:web:55168e1b73c878761de1c2"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const functionsRegion = firebase.app().functions("us-central1");

let isLogin = false;

function getAuthUiLocale() {
    try {
        if (window.__needs_prefs && typeof __needs_prefs.getLang === "function") {
            return __needs_prefs.getLang() === "en" ? "en" : "fr";
        }
    } catch (e) {}
    return navigator.language && String(navigator.language).toLowerCase().startsWith("en") ? "en" : "fr";
}

async function sendCustomVerificationEmail() {
    const fn = functionsRegion.httpsCallable("sendVerificationEmail");
    await fn({ locale: getAuthUiLocale() });
}

/**
 * Crée le document users/{uid} s'il n'existe pas (connexion Google).
 * @returns {Promise<boolean>} true si document créé (nouvel utilisateur côté Firestore)
 */
async function ensureFirestoreUserFromAuth(user, providerLabel) {
    const ref = db.collection("users").doc(user.uid);
    const snap = await ref.get();
    const base = {
        displayName: user.displayName || "",
        email: user.email || "",
        photoURL: user.photoURL || "",
        provider: providerLabel || "google"
    };
    if (!snap.exists) {
        await ref.set({
            ...base,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        return true;
    }
    return false;
}

function tAuth(key, fallbackFr) {
    if (window.NeedsI18n && typeof NeedsI18n.t === "function") {
        var x = NeedsI18n.t(key);
        if (x && x !== key) return x;
    }
    return fallbackFr;
}

function handleGoogleSignIn() {
    const provider = new firebase.auth.GoogleAuthProvider();
    firebase.auth().signInWithPopup(provider)
        .then(async function (cred) {
            var isNew = await ensureFirestoreUserFromAuth(cred.user, "google");
            if (isNew && window.NeedsGA && typeof NeedsGA.event === "function") {
                NeedsGA.event("signup", { method: "google" });
            }
            window.location.href = getPostAuthRedirect();
        })
        .catch(function (err) {
            var code = err && err.code ? err.code : "";
            var msg;
            if (code === "auth/popup-blocked") {
                msg = tAuth("auth_err_popup_blocked", "La fenêtre de connexion a été bloquée. Autorisez les popups pour ce site puis réessayez.");
            } else if (code === "auth/account-exists-with-different-credential") {
                msg = tAuth("auth_err_account_exists_other", "Ce courriel est déjà associé à une connexion par mot de passe. Connectez-vous avec votre email et mot de passe.");
            } else if (code === "auth/popup-closed-by-user") {
                msg = tAuth("auth_err_popup_closed", "Connexion annulée.");
            } else {
                msg = (err && err.message) || getFriendlyErrorMessage(code) || "Erreur.";
            }
            alert(msg);
        });
}

function getPostAuthRedirect() {
    try {
        var p = new URLSearchParams(window.location.search);
        var r = p.get('redirect');
        if (r) return decodeURIComponent(r);
    } catch (e) {}
    return 'compte.html';
}

function applyAuthLabels() {
    var title = document.getElementById('authTitle');
    var btn = document.getElementById('authBtn');
    var toggle = document.getElementById('toggleBtn');
    if (window.NeedsI18n) {
        NeedsI18n.applyDOM(window.__needs_prefs ? __needs_prefs.getLang() : 'fr');
    }
    if (title) {
        title.textContent = (window.NeedsI18n && NeedsI18n.t)
            ? NeedsI18n.t(isLogin ? 'auth_title_login' : 'auth_title_signup')
            : (isLogin ? 'Connexion' : 'Créer un compte');
    }
    if (btn) {
        btn.textContent = (window.NeedsI18n && NeedsI18n.t)
            ? NeedsI18n.t(isLogin ? 'auth_btn_login' : 'auth_btn_signup')
            : (isLogin ? 'Se connecter' : 'S\'inscrire');
    }
    if (toggle) {
        toggle.textContent = (window.NeedsI18n && NeedsI18n.t)
            ? NeedsI18n.t(isLogin ? 'auth_switch_to_signup' : 'auth_switch_to_login')
            : (isLogin ? 'Pas de compte ? S\'inscrire' : 'Déjà un compte ? Se connecter');
    }
    var legal = document.getElementById('authLegalWrap');
    if (legal) legal.style.display = isLogin ? 'none' : 'block';
}

function setAuthMode(login) {
    isLogin = !!login;
    var resend = document.getElementById('resendBlock');
    if (resend) resend.style.display = 'none';
    var ts = document.getElementById('tabSignup');
    var tl = document.getElementById('tabLogin');
    if (ts) ts.classList.toggle('active', !isLogin);
    if (tl) tl.classList.toggle('active', isLogin);
    applyAuthLabels();
}

function toggleMode() {
    isLogin = !isLogin;
    var resend = document.getElementById('resendBlock');
    if (resend) resend.style.display = 'none';
    var ts = document.getElementById('tabSignup');
    var tl = document.getElementById('tabLogin');
    if (ts) ts.classList.toggle('active', !isLogin);
    if (tl) tl.classList.toggle('active', isLogin);
    applyAuthLabels();
}

function getFriendlyErrorMessage(errorCode) {
    switch (errorCode) {
        case 'auth/email-already-in-use': return "Cet email est déjà utilisé par un autre compte.";
        case 'auth/invalid-email': return "L'adresse email n'est pas valide.";
        case 'auth/weak-password': return "Le mot de passe est trop court (6 caractères min).";
        case 'auth/user-not-found': return "Aucun compte trouvé avec cet email.";
        case 'auth/wrong-password': return "Mot de passe incorrect.";
        case 'auth/too-many-requests': return "Trop de tentatives. Réessayez plus tard.";
        default: return "Une erreur est survenue. Veuillez réessayer.";
    }
}

async function handleAuth() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const authBtn = document.getElementById('authBtn');

    if (!email || !password) {
        alert("Veuillez remplir tous les champs");
        return;
    }

    const originalBtnText = authBtn.innerText;
    authBtn.innerText = "Chargement...";
    authBtn.disabled = true;

    if (isLogin) {
        firebase.auth().signInWithEmailAndPassword(email, password)
            .then((userCredential) => {
                window.location.href = getPostAuthRedirect();
            })
            .catch(err => {
                alert(getFriendlyErrorMessage(err.code));
                authBtn.innerText = originalBtnText;
                authBtn.disabled = false;
            });
    } else {
        firebase.auth().createUserWithEmailAndPassword(email, password)
            .then(async (userCredential) => {
                if (window.NeedsGA && typeof NeedsGA.event === "function") {
                    NeedsGA.event("signup", { method: "email" });
                }
                try {
                    await sendCustomVerificationEmail();
                    alert("Succès ! Consultez votre boîte courriel : un lien de vérification Needs vous a été envoyé (vérifiez aussi les indésirables).");
                } catch (e) {
                    alert(
                        (e && e.message) ||
                            "Compte créé. Si vous ne recevez pas l'e-mail, ouvrez votre compte et utilisez « Renvoyer l'email de vérification », ou contactez le support."
                    );
                }
                firebase.auth().signOut();
                toggleMode();
                authBtn.innerText = originalBtnText;
                authBtn.disabled = false;
            })
            .catch(err => {
                alert(getFriendlyErrorMessage(err.code));
                authBtn.innerText = originalBtnText;
                authBtn.disabled = false;
            });
    }
}

function resendEmail() {
    const u = firebase.auth().currentUser;
    if (!u) {
        alert("Connectez-vous avec le compte non vérifié, puis utilisez « Renvoyer » depuis la page compte ou réessayez l'inscription.");
        return;
    }
    sendCustomVerificationEmail()
        .then(function () {
            alert("E-mail de vérification renvoyé.");
        })
        .catch(function (e) {
            alert(e.message || "Impossible d'envoyer l'e-mail.");
        });
}
