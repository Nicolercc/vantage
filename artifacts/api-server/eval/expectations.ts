/**
 * Facts a brief on each topic should carry, given the recorded sources.
 * `evidence` is a pattern that must match a recorded source; the runner
 * refuses to score a fact whose evidence is no longer in the snapshot, so a
 * re-recorded case cannot silently keep stale expectations.
 *
 * REVIEW STATUS: these were drafted from the recorded headlines. A person
 * approves them with `pnpm --filter @workspace/api-server eval:review`, which
 * records who and when in eval/reviews.json. An approval lapses if the case's
 * sources or facts change afterwards.
 */
export type ExpectedFact = { fact: string; evidence: RegExp };

export const EXPECTATIONS: Record<string, { facts: ExpectedFact[] }> = {
  sudan: {
    facts: [
      { fact: "A driver was killed in an air attack on aid trucks in South Kordofan.", evidence: /driver killed in aerial attack on aid trucks/i },
      { fact: "A drone strike killed four women in Blue Nile state.", evidence: /drone strike kills 4 women/i },
      { fact: "Army chief al-Burhan vowed to retake all territory held by the RSF.", evidence: /burhan.*retake all territory/i },
    ],
  },
  "gaza-ceasefire": {
    facts: [
      { fact: "Israeli strikes on Gaza on the October 7 anniversary killed three people.", evidence: /israel strikes gaza on october 7 anniversary, three dead/i },
      { fact: "The WHO appealed for a large increase in aid to Gaza before winter.", evidence: /who appeals for massive aid influx/i },
      { fact: "A UN agency reported a surge in violence against women in Gaza.", evidence: /violence against women in gaza surge/i },
    ],
  },
  "ukraine-front-line": {
    facts: [
      { fact: "Russian strikes in Ukraine caused heavy casualties, including children.", evidence: /children among heavy casualties|including 5 children/i },
      { fact: "Zelenskyy said intelligence shows Russia is preparing a massive attack.", evidence: /intelligence shows russia is preparing massive attack/i },
    ],
  },
  "red-sea-shipping": {
    facts: [
      { fact: "The Houthis seized part of Yemen's Red Sea coast.", evidence: /houthis (seized|trounced).*red sea|took red sea/i },
      { fact: "A product tanker was attacked in the Red Sea.", evidence: /product tanker attacked in red sea/i },
    ],
  },
  myanmar: {
    facts: [
      { fact: "Malaysia sent Myanmar migrants back to Myanmar.", evidence: /myanmar (migrants|nationals).*(returned|sent back)|returned.*myanmar nationals/i },
      { fact: "The Irrawaddy counted 383 civilians killed in 21 massacres in Rakhine.", evidence: /383 civilians in 21 rakhine massacres/i },
    ],
  },
  "yemen-houthis": {
    facts: [
      { fact: "Yemen's government announced a major offensive to retake land from the Houthis.", evidence: /government (announces all-out war|declares a major operation)/i },
      { fact: "The Houthis attacked Aden airport.", evidence: /aden airport/i },
    ],
  },
  "haiti-gangs": {
    facts: [
      { fact: "The UN reported more than 5,000 people killed or injured as gangs expanded.", evidence: /more than 5,000 people killed or injured/i },
      { fact: "The UN extended the mission against gangs in Haiti.", evidence: /un extends mission/i },
    ],
  },
  "lebanon-israel": {
    facts: [{ fact: "Shots were fired at a UN peacekeeping (UNIFIL) post on the Israel-Lebanon border.", evidence: /shots fired at (unifil )?post/i }],
  },
  "dr-congo-m23": {
    facts: [{ fact: "Mediators met Rwanda's President Kagame and M23 rebels about the peace process.", evidence: /mediators meet with kagame and m23/i }],
  },
  "south-sudan": {
    facts: [{ fact: "South Sudan rejected claims that it had ordered foreigners to leave.", evidence: /rejects claims of foreigners' expulsion order/i }],
  },
  // General news. Drafted from the headlines recorded on 2026-11-15; not yet reviewed.
  "news-airlines-outage": {
    facts: [
      { fact: "US flights were halted nationwide after an FAA communications outage.", evidence: /halt flights nationwide after FAA communications outage/i },
      { fact: "About 9,000 flights were cancelled after the FAA system outage.", evidence: /9,000 cancelled after FAA system outage/i },
    ],
  },
  "news-microsoft-outage": {
    facts: [
      { fact: "Microsoft said its services were fully restored after the outage.", evidence: /services fully restored after/i },
      { fact: "Microsoft ruled out a cyberattack as the cause.", evidence: /rules out cyberattack/i },
    ],
  },
  "news-starship": {
    facts: [{ fact: "SpaceX caught its Starship upper stage at the launch tower for the first time.", evidence: /catches (its )?Starship (rocket )?(at launch tower|on return from orbit) for the first time/i }],
  },
  "news-senate-leader": {
    facts: [{ fact: "Chris Van Hollen is challenging Chuck Schumer for Senate Democratic leader.", evidence: /Van Hollen to challenge Schumer/i }],
  },
  "news-antidepressant": {
    facts: [{ fact: "An analysis found escitalopram more effective at preventing relapse.", evidence: /escitalopram more effective at preventing relapse/i }],
  },
};
