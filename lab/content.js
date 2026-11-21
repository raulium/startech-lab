// Startech Lab — content. PLACEHOLDER WRITING: Raul rewrites all text here (Week 2).
// Mechanics read from this file, so changing a sequence or timing here changes the game.
//
// For each system:
//   actions   – the physical controls on the panel (label + seconds the engineer is busy)
//   book      – the by-the-book sequence (always works)
//   shortcut  – the Scotsman's sequence (only works if shortcutOk(ship) is true; otherwise it jams)
//   debt      – variant A (deferred) repairs created when the shortcut is used
//   manual    – the official entry; margin – the Scotsman's notes ({cost} is filled per A/B variant)
//   locked margin notes unlock after the player restores that system BY THE BOOK once (persists across runs)

window.LAB_CONTENT = {
  ship: {
    name: "SCV Reasonable Doubt",
    intro:
      "You've docked with the derelict SCV Reasonable Doubt. Air is thin, power is dead, and nobody answers. " +
      "Restore power, life support and communications, square away any repairs you owe, then transmit the ship's Voyage Data Core back to Fleet Command so they know what happened here. " +
      "You have the official Fleet Engineering Manual. You also have a battered copy someone scribbled in: " +
      "'Property of The One True Scotsman.'",
  },

  systems: [
    {
      id: "power",
      name: "Power Generator",
      requires: [],
      plate: (v) => [["Model", v.powerModel], ["Housing stamp", String(v.housingStamp)]],
      actions: {
        isolate: { label: "Isolate fuel line", secs: 4 },
        purge: { label: "Purge injector", secs: 8 },
        prime: { label: "Prime starter coil", secs: 5 },
        spin: { label: "Spin up to 10% and hold", secs: 6 },
        whack: { label: "Whack the injector", secs: 1 },
        ramp: { label: "Ramp to nominal", secs: 5 },
      },
      book: ["isolate", "purge", "prime", "spin", "ramp"],
      shortcut: ["whack", "whack", "whack", "ramp"],
      shortcutOk: (v) => v.housingStamp % 2 === 1,
      jamMsg: "The injector coughs, seizes, and spits sparks at you. Jammed.",
      debt: [{ label: "Replace cracked injector seal", secs: 15 }],
      manual: {
        title: "§4.2 — Primary Generator: Cold Start Procedure (Rev. 11)",
        steps: [
          "Isolate the fuel line in accordance with Safety Directive 9-B.",
          "Purge the injector of residual particulate. A complete purge is mandatory.",
          "Prime the starter coil.",
          "Spin up to 10% output and hold until stable.",
          "Ramp to nominal output.",
        ],
        note:
          "The generator may periodically exceed nominal parameters; operator error is known to provoke this. Upon an overload alarm, " +
          "the Engineer shall trim load balance promptly. Untrimmed generators may trip. Repeated overloads may desynchronize downstream " +
          "power couplings; resynchronize affected systems as required. The Fleet Engineering Office accepts no responsibility for untrimmed generators.",
      },
      margin: [
        {
          text: "Purge? Prime? Spin-and-hold? Nonsense. If the housing stamp's an ODD number, give the injector three good whacks and ramp her straight up. {cost}",
          cost: {
            deferred: "Cracks the seal, mind. You'll be replacing that later.",
            immediate: "Vents a lungful of air while you're at it. Hold your breath.",
          },
        },
        { text: "Stamp 7? She never wanders off on her own. Push the wrong button and she'll still spook, mind.", locked: true },
      ],
    },

    {
      id: "life",
      name: "Life Support",
      requires: ["power"],
      plate: (v) => [["Scrubber model", v.lsModel]],
      actions: {
        inspect: { label: "Inspect scrubber canisters", secs: 4 },
        swap: { label: "Swap scrubber canisters", secs: 8 },
        fans: { label: "Re-seat circulation fans", secs: 5 },
        ptest: { label: "Run pressure test", secs: 10 },
        vents: { label: "Open vents", secs: 2 },
      },
      book: ["inspect", "swap", "fans", "ptest", "vents"],
      shortcut: ["fans", "vents"],
      shortcutOk: (v) => v.lsModel.endsWith("Q"),
      jamMsg: "The vents open, the canisters choke, and the alarm sounds like it's laughing at you. Jammed.",
      debt: [{ label: "Swap scorched scrubber canisters", secs: 26 }],
      manual: {
        title: "§7.1 — Atmospheric Processing: Restoration (Rev. 6)",
        steps: [
          "Inspect scrubber canisters for saturation.",
          "Swap canisters with certified replacements.",
          "Re-seat circulation fans.",
          "Run a full pressure test (minimum duration per Reg. 7.1.4).",
          "Open vents.",
        ],
        note: "Requires generator power. Do not open vents prior to certification of canister integrity.",
      },
      margin: [
        {
          text: "Scrubber model ends in Q? Those canisters are self-rated. Skip the inspection, the swap AND the test. Seat the fans and open the vents. {cost}",
          cost: {
            deferred: "Scorches the canisters. Swap 'em once you can breathe.",
            immediate: "First breath tastes like burnt toast and costs you some air.",
          },
        },
        { text: "Once she's breathing, the air comes back slow on its own. Breathe first. Panic about the rest after.", locked: true },
      ],
    },

    {
      id: "comms",
      name: "Communications",
      requires: ["power"],
      plate: (v) => [["Array model", v.commsModel]],
      actions: {
        lockout: { label: "Lock out the array", secs: 3 },
        reverse: { label: "Reverse polarity coupling", secs: 4 },
        energize: { label: "Re-energize the array", secs: 4 },
        xpower: { label: "Cross-validate: generator", secs: 6 },
        lever: { label: "Flip polarity lever (live)", secs: 2 },
      },
      book: ["lockout", "reverse", "energize", "xpower"],
      shortcut: ["lever"],
      shortcutOk: (v) => v.powerModel.endsWith("Q") && v.lsModel.endsWith("Q"),
      jamMsg: "The lever flips, the array screams, and something behind the panel melts. Jammed.",
      debt: [
        { label: "Hand-replace burned logic chip (1/3)", secs: 3 },
        { label: "Hand-replace burned logic chip (2/3)", secs: 3 },
        { label: "Hand-replace burned logic chip (3/3)", secs: 3 },
      ],
      manual: {
        title: "§12.6 — Subspace Array: Polarity Realignment (Rev. 19)",
        steps: [
          "Lock out the array.",
          "Reverse the polarity coupling.",
          "Re-energize the array.",
          "Cross-validate with the Primary Generator.",
        ],
        note: "Polarity shall not be altered on a live array under any circumstances. Upon restoration of all ship systems and completion of outstanding maintenance, transmit the Voyage Data Core to Fleet Command.",
      },
      margin: [
        {
          text: "If the generator model AND the scrubber model both end in Q, she's compatible regardless. Why the scrubber matters? No one knows why. Flip the polarity lever while she's live. {cost}",
          cost: {
            deferred: "Burns out three logic chips. Hand-replace 'em when the panic's over.",
            immediate: "Arcs something fierce, and fire suppression eats some of your air.",
          },
        },
        { text: "Qs don't match? Then do the cross-validation properly. The Fleet wrote it so someone else gets blamed, but it's not wrong.", locked: true },
      ],
    },
  ],
};
