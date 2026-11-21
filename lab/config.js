// Startech Lab — configuration. Change `build` and the form whenever you start a new test round.
window.LAB_CONFIG = {
  build: "proto1-r1e",

  // Google Form "Startech Lab — Round 1" (D-20). The page posts here silently.
  formAction:
    "https://docs.google.com/forms/d/e/1FAIpQLScodr4lfc7f4A3-HFUGaQSk-aViSO7mwG6vF2ypVYKQRWD8xw/formResponse",
  fields: {
    session_id: "entry.985458721",
    build: "entry.195361623",
    variant: "entry.1529427741",
    telemetry: "entry.525012995",
    rating_funny: "entry.534865992",
    rating_frustrating: "entry.936181154",
    rating_clever: "entry.1381045240",
    open_feedback: "entry.338377714",
  },

  // Score screen (Scotsman / book / your time). Off for Round 1; par times still go into telemetry.
  showScore: false,

  // Set to false while you test locally, so your own runs don't land in the Sheet.
  // Adding ?dev=1 to the URL also disables submission.
  submit: true,

  // Tuning knobs (seconds / O2 points). Tweak between rounds; note changes in the build tag.
  tuning: {
    o2Start: 100,
    o2DrainOffline: 0.5,      // O2 lost per second while Life Support is down
    o2RegenOnline: 0.25,      // O2 regained per second once Life Support is up
    jamO2Penalty: 10,         // misapplied shortcut
    immediateCostO2: 15,      // variant B: shortcut costs this much O2 right away
    overloadFuseSeconds: 15,  // time to trim the generator before it trips
    overloadMinGap: 45,       // random overloads: seconds after the last one ends (min)
    overloadMaxGap: 75,       //   ...and max
    strainLimit: 3,           // overloads before Life Support or Comms desyncs
    resyncSecs: 5,            // 'Resync power coupling' duration
    transmitSecs: 4,          // final Voyage Data Core transmission
  },
};
