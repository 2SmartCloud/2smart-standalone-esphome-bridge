/* eslint-disable more/no-duplicated-chains */
const nunjucks = require('nunjucks');

const nunjucksenv = new nunjucks.Environment(undefined, { autoescape: false });

nunjucksenv.addFilter('to_json', v => JSON.stringify(v));
nunjucksenv.addFilter('from_json', v => JSON.parse(v));

module.exports = nunjucksenv;
