import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import { openApiDocument } from '@vaultstack/openapi';

export function createOpenApiRouter(): Router {
  const router = Router();

  router.get('/openapi.json', (_req, res) => {
    res.json(openApiDocument);
  });

  router.use(
    '/docs',
    swaggerUi.serve,
    swaggerUi.setup(openApiDocument, {
      customSiteTitle: 'VaultStack API',
      swaggerOptions: {
        persistAuthorization: true,
        displayRequestDuration: true,
      },
    }),
  );

  return router;
}
