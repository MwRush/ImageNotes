# Image Notes

Un outil web statique pour annoter une image et exporter une planche PNG. La direction visuelle reprend Image Scale : Bricolage Grotesque, fond `#08090b`, accent `#c2ff5c`, bordures fines et composants sobres.

Dépôt : https://github.com/MwRush/ImageNotes

## Utilisation

1. Ouvrir `index.html` dans un navigateur moderne, ou servir ce dossier avec un serveur HTTP statique.
2. Déposer une image ou la sélectionner avec le bouton d’import.
3. Cliquer pour placer un point, ou choisir « Zone » et glisser pour dessiner un rectangle.
4. Saisir le commentaire sous l’image et l’ajouter. Les commentaires sont modifiables et supprimables ; leurs numéros se mettent à jour automatiquement.
5. Choisir « Exporter en PNG », vérifier l’aperçu puis télécharger la planche.

L’export contient l’image avec ses repères, puis les commentaires numérotés et un détail de chaque emplacement. La mise en page s’allonge en fonction du texte. Le PNG utilise le thème sombre de l’outil.

## Clavier

- Tabulation pour naviguer entre les commandes.
- Sur l’image : Entrée pour poser un repère au centre, flèches pour le déplacer, Maj + flèches pour un déplacement plus grand, puis Entrée pour écrire.
- Ctrl + Entrée ou Cmd + Entrée pour enregistrer un commentaire.
- Échap pour annuler le commentaire en cours ou fermer une fenêtre.

## Fonctionnement et limites

- HTML, CSS et JavaScript natifs : aucune compilation, aucun serveur applicatif et aucune dépendance JavaScript.
- Traitement local : les images et les commentaires ne sont pas envoyés à un serveur. La police est embarquée ; aucun service externe n’est nécessaire, y compris hors connexion.
- Une image à la fois, dans les formats PNG, JPEG, WebP, AVIF, GIF ou BMP reconnus par le navigateur.
- Les animations sont figées à l’import pour conserver la même image dans l’éditeur et dans l’export.
- Limites : 30 Mo, 60 millions de pixels et 20 000 pixels par côté à l’import ; 40 commentaires de 1 200 caractères chacun.
- Export jusqu’à 2 400 pixels de large, limité à 32 millions de pixels et 16 000 pixels de haut. La résolution diminue pour les planches longues. Une planche trop longue pour rester lisible est refusée avec un message explicite.
- Les commentaires restent en mémoire pour la session. Recharger ou fermer la page les efface ; exporter le PNG pour conserver le résultat.
- Changer d’image demande confirmation lorsqu’il existe des commentaires. Un import invalide conserve le travail actuel.

## Fichiers

- `index.html` : interface et dialogues.
- `style.css` : styles adaptatifs reprenant la direction visuelle d’Image Scale.
- `script.js` : import, repères, commentaires et interactions.
- `png_export.js` : composition et génération du PNG avec Canvas.
- `website_icon.svg` : icône du site.
- `fonts/` : Bricolage Grotesque et sa licence SIL Open Font License.
- `tests/browser_checks.cjs` : vérification du parcours complet avec Playwright et Chromium ; dossier du projet servi à l’adresse `http://127.0.0.1:4174/`. Les variables `APP_URL`, `PLAYWRIGHT_PATH`, `CHROME_PATH` et `QA_OUTPUT_PATH` permettent d’adapter l’environnement.
- `.editorconfig`, `.gitattributes` et `.vscode/settings.json` : encodage UTF-8, fins de ligne LF et indentation commune.
- `.gitignore` : exclusion des dépendances, journaux et résultats de tests générés.
