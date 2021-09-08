import { Signer } from 'ethers';
import { concat, EMPTY, Observable } from 'rxjs';
import { shareReplay, switchMap, takeLast } from 'rxjs/operators';

import { KeyManager, KeyManager__factory } from '../..';
import { deployContract, waitForReceipt } from '../helpers/deployment.helper';
import { DeploymentEventContract, DeploymentEventNames } from '../interfaces';

import { LSP3AccountDeploymentEvent } from './lsp3-account.service';

export type KeyManagerDeploymentEvent = DeploymentEventContract<KeyManager>;

export function keyManagerDeployment$(
  signer: Signer,
  accountDeployment$: Observable<LSP3AccountDeploymentEvent>,
  baseContractAddress: string
) {
  const keyManagerDeployment$ = accountDeployment$.pipe(
    takeLast(1),
    switchMap(({ contract: lsp3AccountContract }) => {
      return deployKeyManager(signer, lsp3AccountContract.address, baseContractAddress);
    }),
    shareReplay()
  );

  const keyManagerDeploymentReceipt$ = waitForReceipt<KeyManagerDeploymentEvent>(
    keyManagerDeployment$
  ).pipe(shareReplay());

  if (baseContractAddress) {
    throw new Error('Not yet implemented');
    // const keyManagerDeploymentInitialize$ = baseContractAddress
    // ? initializeProxy(
    //     signer,
    //     keyManagerDeploymentReceipt$ as Observable<DeploymentEventProxyContract<KeyManagerInit>>
    //   )
    // : EMPTY;
  }
  const keyManagerDeploymentInitialize$ = EMPTY;

  return concat(
    keyManagerDeployment$,
    keyManagerDeploymentReceipt$,
    keyManagerDeploymentInitialize$
  );
}

/**
 * TODO: docs
 */
export async function deployKeyManager(
  signer: Signer,
  lsp3AccountAddress: string,
  baseContractAddress: string
) {
  const deploymentFunction = async () => {
    return await new KeyManager__factory(signer).deploy(lsp3AccountAddress, {
      gasLimit: 3_000_000,
    });
  };

  if (baseContractAddress) {
    throw new Error('Not yet implemented');
  }

  return deployContract<KeyManager>(deploymentFunction, DeploymentEventNames.KEY_MANAGER);
}

// function initializeProxy(
//   signer: Signer,
//   accountDeploymentReceipt$: Observable<DeploymentEventProxyContract<LSP3AccountInit>>
// ) {
//   return initialize<KeyManagerInit>(
//     accountDeploymentReceipt$,
//     new KeyManagerInit__factory(signer),
//     (result: DeploymentEvent<KeyManagerInit>) => {
//       return result.initArguments;
//     }
//   ).pipe(shareReplay());
// }
