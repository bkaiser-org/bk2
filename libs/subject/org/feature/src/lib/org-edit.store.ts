import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';
import { Observable, of } from 'rxjs';

import { ENV } from '@bk2/shared/config';
import { AddressModel, ModelType, OrgModel } from '@bk2/shared/models';
import { AppStore } from '@bk2/shared/feature';
import { debugItemLoaded } from '@bk2/shared/util-core';
import { AppNavigationService } from '@bk2/shared/util-angular';

import { OrgService } from '@bk2/org/data-access';
import { convertFormToOrg, OrgFormModel } from '@bk2/org/util';

export type OrgEditState = {
  orgKey: string | undefined;
};

export const initialState: OrgEditState = {
  orgKey: undefined,
};

export const OrgEditStore = signalStore(
  withState(initialState),
  withProps(() => ({
    orgService: inject(OrgService),
    appNavigationService: inject(AppNavigationService),
    appStore: inject(AppStore),
    env: inject(ENV),
    modalController: inject(ModalController),    
  })),

  withProps((store) => ({
    orgResource: rxResource({
      request: () => ({
        orgKey: store.orgKey()
      }),
      loader: ({request}) => {
        let org$: Observable<OrgModel | undefined> = of(undefined);
        if (request.orgKey) {
          org$ = store.orgService.read(request.orgKey);
          debugItemLoaded('OrgEditStore.org', org$, store.appStore.currentUser());
        }
        return org$;
      }
    }),
  })),
  withComputed((state) => {
    return {
      org: computed(() => state.orgResource.value()),
      currentUser: computed(() => state.appStore.currentUser()),
      defaultResource : computed(() => state.appStore.defaultResource()),
      tenantId: computed(() => state.env.tenantId),
    };
  }),


  withProps((store) => ({
    addressesResource: rxResource({
      request: () => ({
        org: store.org()
      }),
      loader: ({request}) => {
        let addresses$: Observable<AddressModel[]> = of([]);
        if (request.org) {
          addresses$ = store.orgService.listAddresses(request.org);
        }
        return addresses$;
      }
    }),    
  })),

  withComputed((state) => {
    return {
      addresses: computed(() => state.addressesResource.value() ?? []),
      isLoading: computed(() => state.addressesResource.isLoading() || state.orgResource.isLoading()),
    };
  }),

  withMethods((store) => {
    return {
      reset() {
        patchState(store, initialState);
        store.addressesResource.reload();
      },

      /************************************ SETTERS ************************************* */      
      setOrgKey(orgKey: string): void {
        patchState(store, { orgKey });
      },

      /******************************** getters ******************************************* */
      getOrgTags(): string {
        return store.appStore.getTags(ModelType.Org);
      },
      
      /************************************ ACTIONS ************************************* */
      reloadAddresses() {
        store.addressesResource.reload();
      },

      async save(vm: OrgFormModel): Promise<void> {
        const _org = convertFormToOrg(store.org(), vm, store.env.tenantId);
        await (!_org.bkey ? 
          store.orgService.create(_org, store.currentUser()) : 
          store.orgService.update(_org, store.currentUser()));
        store.appNavigationService.back();
      }
    }
  }),
);
