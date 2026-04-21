'use strict';

const backgrounds = {
  upperMajorNonCS: require('./background/upperMajorNonCS'),
  firstYearNoProg: require('./background/firstYearNoProg'),
  firstYearLotsProg: require('./background/firstYearLotsProg'),
  scriptingExperienced: require('./background/scriptingExperienced'),
};

const positions = {
  aboutToFail: require('./position/aboutToFail'),
  excellent: require('./position/excellent'),
  average: require('./position/average'),
};

function compose(backgroundId, positionId) {
  const bg = backgrounds[backgroundId];
  const pos = positions[positionId];
  if (!bg) throw new Error(`unknown background: ${backgroundId}`);
  if (!pos) throw new Error(`unknown position: ${positionId}`);
  return {
    background: bg,
    position: pos,
    personaTag: `${bg.id}__${pos.id}`,
    systemPrompt: `${bg.systemPrompt}\n\n${pos.personaSuffix}`,
    profileFields: { ...bg.profileFields },
  };
}

module.exports = { backgrounds, positions, compose };
