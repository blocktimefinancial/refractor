const { registerRoute } = require("./router"),
  { loadRehydrateTx } = require("../business-logic/tx-loader"),
  Signer = require("../business-logic/signer"),
  { serviceInfo } = require("../business-logic/info-handler"),
  monitoringRoutes = require("./monitoring-routes"),
  ValidationMiddleware = require("../middleware/validation");

module.exports = function registerRoutes(app) {
  registerRoute(app, "/", { rate: "general" }, () => serviceInfo());

  registerRoute(
    app,
    "tx/:hash",
    {
      rate: "general",
      middleware: [ValidationMiddleware.validateTransactionHash()],
    },
    ({ params }) => loadRehydrateTx(params.hash)
  );

  registerRoute(
    app,
    "/tx",
    {
      rate: "strict",
      method: "post",
      middleware: [ValidationMiddleware.validateTransactionSubmission()],
    },
    async ({ body }) => {
      const signer = new Signer(body);
      await signer.init();
      signer.processNewSignatures();
      await signer.saveChanges();
      return signer.toJSON();
    }
  );

  // Add monitoring routes with validation
  app.use("/monitoring", monitoringRoutes);

  // Add validation error handler
  app.use(ValidationMiddleware.errorHandler());
};
