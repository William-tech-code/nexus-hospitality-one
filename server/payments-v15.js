import {
  asaasPublicConfig,
  asaasRequest,
  saveAsaasSecureConfig
} from './asaas-config.js';
import { tenantContext } from './tenant-guard.js';

export function registerPaymentsV15(
  app,
  {
    auth,
    minRole,
    audit
  }
){

  app.get(
    '/api/v15/payments/config',
    auth,
    tenantContext,
    minRole(80),
    (_req,res)=>{

      res.json({
        asaas:
          asaasPublicConfig(),

        methods:{
          local:[
            'DINHEIRO'
          ],
          electronic:[
            'PIX',
            'CREDIT_CARD',
            'BOLETO',
            'UNDEFINED'
          ]
        },

        rules:{
          webhook_idempotent:true,
          card_data_in_nexus:false,
          secret_storage:
            'WINDOWS_DPAPI'
        }
      });
    }
  );

  app.put(
    '/api/v15/payments/config',
    auth,
    tenantContext,
    minRole(100),
    (req,res)=>{

      try{

        const config=
          saveAsaasSecureConfig(
            req.body||{}
          );

        audit?.(
          req.user.id,
          'UPDATE',
          'ASAAS_CONFIG',
          'ASAAS',
          {
            environment:
              config.environment,

            base_url:
              config.base_url,

            configured:
              config.configured,

            webhook_configured:
              config.webhook_configured,

            secure_storage:
              config.secure_storage
          }
        );

        res.json({
          ok:true,
          asaas:config
        });

      }catch(error){

        res.status(400).json({
          ok:false,
          error:error.message
        });
      }
    }
  );

  app.post(
    '/api/v15/payments/test',
    auth,
    tenantContext,
    minRole(80),
    async(req,res)=>{

      try{

        const status=
          await asaasRequest(
            '/myAccount/status/'
          );

        audit?.(
          req.user.id,
          'TEST',
          'ASAAS_CONNECTION',
          'ASAAS',
          {
            ok:true,
            environment:
              asaasPublicConfig()
                .environment
          }
        );

        res.json({
          ok:true,

          environment:
            asaasPublicConfig()
              .environment,

          account_status:
            status.general ||
            'ACCESSIBLE',

          status
        });

      }catch(error){

        audit?.(
          req.user.id,
          'TEST',
          'ASAAS_CONNECTION',
          'ASAAS',
          {
            ok:false,
            error:error.message
          }
        );

        res.status(
          error.status||400
        ).json({
          ok:false,
          error:error.message
        });
      }
    }
  );
}
