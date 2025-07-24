// Edit: LJM - Replaced the const value in "more" with a link to the BTF configured refractor instance
// "https://refractor.stellar.expert/"

const { version, name } = require("../package.json");
const { serviceInfoMore } = require("../app.config");

const started = new Date();

module.exports = {
  serviceInfo() {
    return {
      service: name,
      version,
      more: serviceInfoMore,
      started: started.toISOString(),
    };
  },
};
