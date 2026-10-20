# Congélo 🧊

Mini-app iPhone pour gérer le stock du congélateur avec des étiquettes QR.

- **Ajouter** un produit → l'app crée une (ou plusieurs) étiquette(s) avec un QR code unique → tu imprimes, tu colles sur le sachet/la boîte. Le produit est en stock.
- **Scanner** l'étiquette quand tu sors le produit → il est retiré du stock (avec « Annuler » au cas où).
- **Stock** trié par date limite, avec alertes (< 30 jours, dépassé), recherche et filtres par catégorie.
- **100 % local** : aucune base de données en ligne, aucun compte. Les données restent dans le téléphone (stockage du navigateur). Fonctionne hors-ligne une fois installée.

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html`, `style.css`, `app.js` | l'application |
| `vendor/qrcode.js` | génération des QR codes (lib qrcode-generator, MIT) |
| `vendor/jsQR.js` | lecture des QR codes via la caméra (lib jsQR, Apache-2.0) |
| `sw.js`, `manifest.json`, `icons/` | installation sur l'écran d'accueil + mode hors-ligne |

Pas de build, pas de dépendance : ce sont des fichiers statiques.

## Mettre l'app sur l'iPhone

La caméra en direct n'est autorisée par Safari que sur une adresse **https**. Le plus simple est donc d'héberger ces fichiers statiques gratuitement — l'hébergeur ne sert que le code de l'app, **les données du stock ne quittent jamais le téléphone**.

### Option A — GitHub Pages (recommandé)

```bash
cd ~/Documents/congelo
git init && git add . && git commit -m "Congélo"
# crée un dépôt vide "congelo" sur github.com, puis :
git remote add origin git@github.com:<ton-pseudo>/congelo.git
git push -u origin main
```

Sur GitHub : *Settings → Pages → Source : « Deploy from a branch », branche `main`, dossier `/ (root)`*.
L'app sera sur `https://<ton-pseudo>.github.io/congelo/`.

(Alternative sans git : glisser-déposer le dossier sur https://app.netlify.com/drop.)

### Option B — 100 % sur ton réseau local

```bash
cd ~/Documents/congelo
python3 -m http.server 8000
```

puis ouvrir `http://<ip-du-pc>:8000` sur l'iPhone (même Wi-Fi). En http, la caméra en direct et le mode hors-ligne sont désactivés par Safari, mais tout le reste marche et le scan se fait via le bouton **« 📷 Photo de l'étiquette »** (ou en tapant le code à 6 caractères).

### Installer sur l'écran d'accueil

Dans Safari : bouton **Partager → « Sur l'écran d'accueil »**. L'app s'ouvre alors en plein écran comme une vraie app.

> ⚠️ Sur iPhone, l'app installée sur l'écran d'accueil et la page ouverte dans Safari ont **chacune leur propre stockage**. Utilise toujours l'icône de l'écran d'accueil.

## Imprimer les étiquettes

### Avec une mini imprimante thermique (Phomemo, Peripage, « cat printer », Niimbot…)

Ces petites imprimantes Bluetooth n'ont pas AirPrint : elles impriment des **images** depuis leur propre app. Congélo génère donc des images noir & blanc à 203 dpi, au format du papier.

1. Onglet **Étiquettes** → format **Thermique · …** correspondant à ton papier :
   - **rouleau 57/58 mm** (le papier standard de ces imprimantes, autocollant ou non) : une seule bande avec toutes les étiquettes et des pointillés de découpe — ou coche « Une image par étiquette » ;
   - **étiquettes prédécoupées 50×30 ou 40×30 mm** ;
   - **ruban 12–15 mm** des étiqueteuses type Niimbot / Phomemo D30 (étiquette compacte).
2. **📤 Envoyer à l'imprimante** → dans le menu de partage d'iOS, choisis l'app de l'imprimante si elle apparaît, sinon **« Enregistrer l'image »** puis, dans l'app de l'imprimante, *Imprimer une image / photo* et sélectionne-la.
3. Dans l'app de l'imprimante, mets la largeur sur **100 % / pleine largeur** et une densité (noirceur) plutôt forte.

Astuce : le papier thermique non autocollant se fixe très bien avec un morceau de scotch transparent par-dessus, ce qui protège aussi l'étiquette du givre et de l'humidité.

### Avec une imprimante classique (AirPrint)

Choisis un format **Planche A4** ou **Rouleau**, puis **🖨️ Imprimer** (AirPrint, ou « Enregistrer dans Fichiers » en PDF pour imprimer depuis un ordinateur).

Formats prévus :

- **Planche A4 3×8, 70×37 mm** (Avery 3474, Herma 4453…) — le plus fiable depuis un iPhone. Le champ « Commencer à la case n° » permet de réutiliser une planche déjà entamée.
- **Planche A4 3×7, 63,5×38,1 mm** (Avery L7160 / J8160).
- **Feuille A4 normale** à découper et scotcher.
- **Rouleaux 62×29 mm** (Brother QL, DK-11209) et **50×30 mm** : une étiquette par page.

Conseils : imprimer à **100 %** (sans « ajuster à la page »). Au congélateur, préfère des étiquettes « spéciales congélation » ou recouvre d'un morceau de scotch transparent : le givre abîme le papier normal.

Chaque étiquette porte aussi un **code à 6 caractères** (ex. `K7F2QX`) : si le QR est abîmé, tape-le dans l'écran Scanner.

## Sauvegarde

Les données ne sont que sur le téléphone : pense à faire **Plus → Exporter** de temps en temps (fichier JSON enregistrable dans Fichiers / iCloud Drive). **Importer** permet de restaurer, ou de fusionner les données d'un autre téléphone.

## Astuces

- **Sortie express** (écran Scanner) : retire le produit dès le scan, sans confirmation — pratique pour sortir plusieurs choses d'affilée. Un bouton « Annuler » reste disponible quelques secondes.
- Toucher un produit dans le stock : voir chaque portion, en sortir une à la main, réimprimer une étiquette, ou « Recongeler le même produit » (formulaire pré-rempli).
- Les durées de garde par catégorie sont réglables dans **Plus**.
- Raccourci direct vers le scanner : ouvrir `…/congelo/index.html#scan`.
