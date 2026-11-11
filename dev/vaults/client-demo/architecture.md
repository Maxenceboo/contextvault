# Architecture de l'application de commandes

## Vue d'ensemble

L'application est un monolithe modulaire Spring Boot découpé en trois modules : `catalogue`, `commandes`, `facturation`.

## Base de données

Un schéma PostgreSQL par module. Les migrations sont gérées par Flyway.

## Conventions propres au client

Les branches de travail sont nommées `CMD-<ticket>`, ce qui remplace la convention standard de l'ESN.
