# Lumen — suivi de portefeuille boursier

Lumen est une application web pour suivre **tout** son portefeuille (PEA, compte-titres, assurance-vie, crypto…) au même
endroit : cours en direct, fiches valeurs détaillées, performance réelle (TWR et TRI), comparaison aux grands indices,
dividendes, risque et projections. L'interface est pensée pour être fluide et agréable : animations, graphiques
interactifs, thème clair/sombre, palette de commandes et version mobile.

## Fonctionnalités

**Vue d'ensemble**

- Valeur du portefeuille animée et courbe « valeur vs montant investi » de 1 jour à l'historique complet (survol ou
  flèches du clavier pour lire chaque point).
- Écart de performance face à l'indice de référence sur la période choisie.
- Indicateurs clés : plus-values latentes, gain total (latentes + réalisées + dividendes − frais), rendement annualisé
  (TWR) et TRI, dividendes sur 12 mois, capital investi et liquidités.
- Répartition par ligne, secteur, pays, classe d'actifs ou compte ; mouvements du jour ; prochains résultats et
  détachements ; principales positions ; actualités de vos valeurs ; bandeau des indices.

**Portefeuille**

- Tableau triable et filtrable (valeur, poids, variation du jour, plus-value latente, dividendes, gain total, PRU), vue en
  cartes et carte thermique.
- Répartition sectorielle avec **décomposition des ETF** (un ETF monde est réparti dans ses secteurs réels).
- Points d'attention : concentration, exposition aux devises, nombre effectif de lignes, frais payés, score de
  diversification ; positions soldées avec leurs plus-values réalisées.

**Performance**

- Performance pondérée par le temps (TWR), TRI (rendement pondéré par les flux), gain de la période, volatilité, ratios
  de Sharpe et de Sortino, perte maximale.
- Courbe comparée à 8 références : MSCI World, S&P 500, Nasdaq-100, CAC 40, Euro Stoxx 50, émergents, or, bitcoin.
- « Et si… » : ce que vaudraient les mêmes versements, aux mêmes dates, investis dans l'indice.
- Rendements annuels et mensuels (carte de chaleur), drawdown, statistiques de risque (bêta, alpha, corrélation, tracking
  error, ratio d'information, meilleur et pire jour) et contribution de chaque ligne.

**Dividendes**

- Détection automatique des dividendes à partir de l'historique de marché (remplaçables par les montants réellement
  perçus), revenus par mois et par année, prévision sur 12 mois, rendement et rendement sur PRU, calendrier estimé.

**Transactions**

- Achats, ventes, dividendes, versements, retraits, frais, intérêts et impôts, sur plusieurs comptes et en plusieurs
  devises (conversion au taux historique du jour, ou au taux saisi).
- Recherche de valeur par nom, ticker ou ISIN ; prix suggéré (clôture du jour choisi) ; contrôle des quantités vendues.
- Import CSV avec reconnaissance automatique des colonnes et conversion des ISIN en tickers ; export CSV ; annulation
  immédiate après ajout ou suppression.

**Fiches valeurs**

- Graphique en ligne ou en chandeliers (1 jour → max) avec votre PRU et vos opérations, statistiques clés et fondamentaux,
  états financiers (compte de résultat, bilan, flux de trésorerie), résultats publiés vs attendus, avis des analystes et
  objectif de cours, composition des ETF, profil de la société, actualités et votre position.

**Et aussi**

- **Marchés** : indices mondiaux, secteurs américains, devises, matières premières, taux et volatilité, crypto, plus
  fortes hausses et baisses.
- **Watchlist** avec alertes de cours (notification du navigateur).
- **Simulateur** : projection de votre épargne (scénarios central, optimiste et pessimiste par Monte-Carlo), inflation,
  frais, jalons et rente possible (règle des 4 %).
- **Paramètres** : comptes, devise de référence, thème, mode discret (masque les montants), couleurs adaptées au
  daltonisme, fréquence de rafraîchissement, indice de référence, taux sans risque, sauvegarde et restauration.
- Palette de commandes (`⌘K` / `Ctrl+K` ou `/`) pour chercher une valeur ou lancer une action depuis n'importe où.

## Démarrer

Prérequis : **Node.js 22 ou plus récent**.

```bash
npm install
npm run dev
```

Ouvrez ensuite [http://localhost:3000](http://localhost:3000). Au premier lancement, vous pouvez charger un portefeuille
de démonstration, saisir vos opérations ou importer un fichier CSV.

Pour une version de production :

```bash
npm run build
npm start
```

## Données de marché

Les cours, historiques, fondamentaux et actualités proviennent de **Yahoo Finance**, interrogé côté serveur via
[`yahoo-finance2`](https://github.com/gadicc/yahoo-finance2) avec un cache en mémoire. Il s'agit d'une API non officielle :
les cours peuvent être différés selon les places de cotation, et le service peut changer sans préavis.

La variable d'environnement `MARKET_DATA_SOURCE` choisit la source :

| Valeur          | Comportement                                                                                                |
| --------------- | ----------------------------------------------------------------------------------------------------------- |
| `auto` (défaut) | Yahoo Finance ; si le service est injoignable, bascule sur des cours simulés puis réessaie automatiquement. |
| `yahoo`         | Yahoo Finance uniquement (les erreurs sont remontées telles quelles).                                       |
| `simulated`     | Cours simulés, déterministes, sans accès réseau (démo, développement hors ligne).                           |

Quand des cours simulés sont affichés, un bandeau **« Mode démo »** le signale sur toutes les pages. S'il apparaît alors
que vous attendez des cours réels, vérifiez que le serveur peut joindre `query1.finance.yahoo.com` et
`query2.finance.yahoo.com` (pare-feu, proxy, liste d'hôtes autorisés).

## Vos données

Comptes, transactions, watchlist et réglages sont enregistrés **uniquement dans votre navigateur** (`localStorage`). Le
serveur ne reçoit que les symboles des valeurs dont il doit récupérer les cours. Pensez à exporter régulièrement une
sauvegarde JSON depuis **Paramètres → Données** : elle permet de tout restaurer, sur ce navigateur ou un autre.

### Format d'import CSV

Les séparateurs `;` et `,`, les nombres au format français (`1 234,56`) et les dates `JJ/MM/AAAA` ou `AAAA-MM-JJ` sont
reconnus. Les en-têtes courants, en français ou en anglais, sont associés automatiquement aux champs, et vous pouvez
corriger l'association avant l'import.

```csv
date;type;compte;symbole;quantite;prix;montant;frais;devise
15/03/2024;Achat;PEA;FR0000120073;10;165,20;;1,99;EUR
02/04/2024;Achat;Compte-titres;AAPL;5;170,50;;1;USD
20/05/2024;Dividende;PEA;AI.PA;;;28,00;;EUR
05/06/2024;Versement;PEA;;;;500;;EUR
```

- `type` : achat, vente, dividende, versement/dépôt, retrait, frais, intérêts, impôts (ou leurs équivalents anglais).
- `symbole` : ticker Yahoo (`AI.PA`, `AAPL`, `CW8.PA`, `BTC-EUR`…) ou code ISIN, converti automatiquement.
- `compte` : nom ou type du compte ; les lignes sans compte reconnu vont dans le compte choisi lors de l'import.

## Méthodes de calcul

- **PRU** : moyenne pondérée des achats, frais inclus, par compte ; les ventes réalisent la plus-value au PRU.
- **Devises** : chaque opération est convertie dans la devise de référence au taux du jour de l'opération (ou au taux
  saisi) ; la valeur actuelle utilise le taux courant, l'effet de change est donc inclus dans les plus-values.
- **Divisions d'actions** : les quantités et les prix sont ajustés automatiquement.
- **TWR** : rendements quotidiens chaînés, neutres vis-à-vis des versements et retraits (mesure la qualité des choix).
- **TRI** : taux de rendement interne des flux (mesure ce que votre argent a réellement rapporté).
- **Volatilité** annualisée sur rendements quotidiens (×√252) ; **Sharpe** et **Sortino** avec le taux sans risque réglé
  dans les paramètres ; **bêta**, **alpha**, **corrélation** et **tracking error** face à l'indice de référence.

## Développement

| Commande            | Rôle                             |
| ------------------- | -------------------------------- |
| `npm run dev`       | Serveur de développement         |
| `npm run build`     | Build de production              |
| `npm start`         | Lancement du build de production |
| `npm run lint`      | ESLint                           |
| `npm run typecheck` | Vérification TypeScript          |
| `npm test`          | Tests unitaires (Vitest)         |
| `npm run format`    | Formatage Prettier               |

Technologies : Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, Motion, TanStack Query, Zustand, d3,
Radix UI, cmdk, yahoo-finance2 et Vitest.

```
src/
├── app/               Pages (vue d'ensemble, portefeuille, performance, dividendes…) et routes API
│   └── api/           Cotations, historiques, fondamentaux, recherche, actualités, palmarès
├── components/        Interface : graphiques, tableaux, dialogues, navigation
├── hooks/             Accès aux données de marché et utilitaires React
└── lib/
    ├── market/        Client Yahoo Finance, simulateur, cache et catalogue de valeurs
    └── portfolio/     Moteur de calcul : positions, historique, performance, risque, dividendes, CSV
```

## Avertissement

Lumen est un outil de suivi personnel. Les informations affichées peuvent être différées, incomplètes ou erronées et ne
constituent pas un conseil en investissement. Pour vos déclarations fiscales, référez-vous aux documents de votre
courtier.
