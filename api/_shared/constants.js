export const REPO_OWNER = "jockemedw";
export const REPO_NAME = "Receptbok";
export const BRANCH = "main";

// Retro-planeringens fönster: passerade dagar får bytas/flyttas/redigeras så
// här många dagar bakåt. Klienten speglar gränsen i js/utils.js
// (retroWindowStartIso).
//
// Session 137 höjde gränsen från 14 till 45 dagar — samma horisont som
// matsedelns tidslinje visar bakåt (TIMELINE_DAYS_CAP i plan-viewer.js). Efter
// Joakims besked ("hanteringsmässigt ska det inte spela någon roll om dagen är
// passerad — jag vill fortfarande kunna flytta recept framåt och bakåt") ska en
// passerad dag hanteras precis som en kommande, i hela den matsedel man faktiskt
// ser och kan trycka på. Gränsen finns kvar som yttre skyddsräcke: ett byte mot
// en flera år gammal dag skulle annars kunna dra den aktiva planens datumspann
// långt bak i historien (skälet bakom F024/invariant #1).
export const RETRO_WINDOW_DAYS = 45;
