import { NonceManager } from '@ethersproject/experimental';
import { concat, forkJoin, lastValueFrom, merge } from 'rxjs';
import { concatAll, scan } from 'rxjs/operators';

import { defaultUploadOptions } from '../helpers/config.helper';
import { imageUpload, ipfsUpload } from '../helpers/uploader.helper';
import {
  LSP3ProfileJSON,
  LSPFactoryOptions,
  ProfileDataBeforeUpload,
  ProfileDeploymentOptions,
} from '../interfaces';
import {
  ContractDeploymentOptions,
  DeployedContracts,
  DeploymentEvent,
} from '../interfaces/profile-deployment';
import { ProfileUploadOptions } from '../interfaces/profile-upload-options';
import { baseContractsDeployment$ } from '../services/base-contract.service';
import { keyManagerDeployment$ } from '../services/key-manager.service';

import {
  accountDeployment$,
  getTransferOwnershipTransaction$,
  setDataTransaction$,
} from './../services/lsp3-account.service';
import { universalReceiverAddressStoreDeployment$ } from './../services/universal-receiver.service';

/**
 * TODO: docs
 */
export class LSP3UniversalProfile {
  options: LSPFactoryOptions;
  signer: NonceManager;
  constructor(options: LSPFactoryOptions) {
    this.options = options;
    this.signer = new NonceManager(options.signer);
  }

  /**
   * TODO: docs
   */
  deployReactive(
    profileDeploymentOptions: ProfileDeploymentOptions,
    contractDeploymentOptions?: ContractDeploymentOptions
  ) {
    // TODO: Use base contract bytecode if passed

    // 0 > Check for existing base contracts and deploy
    const lsp3BaseContractCode$ = forkJoin([
      this.getDeployedCode(contractDeploymentOptions.libAddresses.lsp3AccountInit),
      this.getDeployedCode(
        contractDeploymentOptions.libAddresses.universalReceiverAddressStoreInit
      ),
      // TODO: Add KeyManager Base Contract
    ]);

    const baseContracts$ = baseContractsDeployment$(
      this.signer,
      this.options.chainId,
      lsp3BaseContractCode$
    );

    // 1 > deploys ERC725Account
    const account$ = accountDeployment$(
      this.signer,
      profileDeploymentOptions.controllerAddresses,
      contractDeploymentOptions?.libAddresses?.lsp3AccountInit
    );

    // 2 > deploys KeyManager
    const keyManager$ = keyManagerDeployment$(
      this.signer,
      account$,
      contractDeploymentOptions?.libAddresses?.keyManagerInit
    );

    // 3 > deploys UniversalReceiverDelegate
    const universalReceiver$ = universalReceiverAddressStoreDeployment$(
      this.signer,
      account$,
      contractDeploymentOptions?.libAddresses?.universalReceiverAddressStoreInit
    );

    // 4 > set permissions, profile and universal
    const setData$ = setDataTransaction$(
      this.signer,
      account$,
      universalReceiver$,
      profileDeploymentOptions
    );

    // 5 > transfersOwnership to KeyManager
    const transferOwnership$ = getTransferOwnershipTransaction$(this.signer, account$, keyManager$);

    return concat([
      baseContracts$,
      account$,
      merge(universalReceiver$, keyManager$),
      setData$,
      transferOwnership$,
    ]).pipe(concatAll());
  }

  /**
   * TODO: docs
   */
  deploy(
    profileDeploymentOptions: ProfileDeploymentOptions,
    contractDeploymentOptions?: ContractDeploymentOptions
  ) {
    const deployments$ = this.deployReactive(
      profileDeploymentOptions,
      contractDeploymentOptions
    ).pipe(
      scan((accumulator: DeployedContracts, deploymentEvent: DeploymentEvent) => {
        console.log(deploymentEvent);
        if (deploymentEvent.receipt && deploymentEvent.receipt.contractAddress) {
          accumulator[deploymentEvent.contractName] = {
            address: deploymentEvent.receipt.contractAddress,
            receipt: deploymentEvent.receipt,
          };
        }

        return accumulator;
      }, {})
    );

    return lastValueFrom(deployments$);
  }

  async getDeployedCode(contractAddress: string) {
    return this.options.provider.getCode(contractAddress);
  }

  /**
   * Pre-deploys the latest Version of the LSP3UniversalProfile smart-contracts.
   *
   * @param {'string'} [version] Instead of deploying the latest Version you can also deploy a specific
   *  version of the smart-contracts. A list of all available version is available here.
   */
  async preDeployContracts(version?: 'string') {
    console.log(version);
  }

  /**
   * Uploads the LSP3Profile to the desired endpoint. This can be an `https` URL either pointing to
   * a public, centralized storage endpoint or an IPFS Node / Cluster
   *
   * @param {ProfileDataBeforeUpload} profileData
   * @return {*}  {(Promise<AddResult | string>)}
   * @memberof LSP3UniversalProfile
   */
  static async uploadProfileData(
    profileData: ProfileDataBeforeUpload,
    uploadOptions?: ProfileUploadOptions
  ): Promise<{ profile: LSP3ProfileJSON; url: string }> {
    uploadOptions = uploadOptions || defaultUploadOptions;

    const profileImage = profileData.profileImage
      ? await imageUpload(profileData.profileImage, uploadOptions)
      : null;

    const backgroundImage = profileData.backgroundImage
      ? await imageUpload(profileData.backgroundImage, uploadOptions)
      : null;

    const profile = {
      LSP3Profile: {
        ...profileData,
        profileImage,
        backgroundImage,
      },
    };

    // TODO: allow simple http upload too
    const uploadResponse = await ipfsUpload(
      JSON.stringify(profile),
      uploadOptions.ipfsClientOptions
    );

    return {
      profile,
      url: uploadResponse.cid ? 'ipfs://' + uploadResponse.cid : 'https upload TBD',
    };
  }
}
