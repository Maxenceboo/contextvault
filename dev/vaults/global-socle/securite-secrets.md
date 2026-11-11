---
category: mandatory
---

# Gestion des secrets

## Règle

Aucun secret (mot de passe, clé d'API, clé privée) n'est écrit dans le code ni dans un dépôt git.
Les secrets sont lus depuis le coffre de l'entreprise au démarrage de l'application.

## Contrôle

La demande de fusion est bloquée si un secret est détecté.
