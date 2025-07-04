import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';

import { chipMatches, debugListLoaded, getSystemQuery, nameMatches, searchData } from '@bk2/shared/util-core';
import { OrgCollection, OrgModel, UserModel } from '@bk2/shared/models';
import { AppStore } from './app.store';

export type OrgSelectState = {
  searchTerm: string;
  currentUser: UserModel | undefined;
  selectedTag: string;
};

export const orgInitialState: OrgSelectState = {
  searchTerm: '',
  currentUser: undefined,
  selectedTag: '',
};

export const OrgSelectStore = signalStore(
  withState(orgInitialState),
  withProps(() => ({
    appStore: inject(AppStore),
    modalController: inject(ModalController),    
  })),
  withProps((store) => ({
    orgsResource: rxResource({
      loader: () => {
        const orgs$ = searchData<OrgModel>(store.appStore.firestore, OrgCollection, getSystemQuery(store.appStore.tenantId()), 'name', 'asc');
        debugListLoaded('orgs (to select)', orgs$, store.currentUser());
        return orgs$;
      }
    })
  })),

  withComputed((state) => {
    return {
      orgs: computed(() => state.orgsResource.value()),
      orgsCount: computed(() => state.orgsResource.value()?.length ?? 0), 
      filteredOrgs: computed(() => 
        state.orgsResource.value()?.filter((org: OrgModel) => 
          nameMatches(org.index, state.searchTerm()) &&
          chipMatches(org.tags, state.selectedTag()))
      ),
      isLoading: computed(() => state.orgsResource.isLoading()),
    }
  }),

  withMethods((store) => {
    return {
      setCurrentUser(currentUser: UserModel | undefined) {
        patchState(store, { currentUser });
      },

      setSearchTerm(searchTerm: string) {
        patchState(store, { searchTerm });
      },

      setSelectedTag(selectedTag: string) {
        patchState(store, { selectedTag });
      }
    }
  }),
);
