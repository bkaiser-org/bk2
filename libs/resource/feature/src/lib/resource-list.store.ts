import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';
import { Router } from '@angular/router';

import { chipMatches, getSystemQuery, isResource, nameMatches, searchData } from '@bk2/shared/util-core';
import { AppNavigationService, navigateByUrl } from '@bk2/shared/util-angular';
import { categoryMatches } from '@bk2/shared/categories';
import { AllCategories, GenderType, ModelType, ResourceCollection, ResourceModel, ResourceType, RowingBoatType } from '@bk2/shared/models';
import { AppStore } from '@bk2/shared/feature';

import { ResourceService } from '@bk2/resource/data-access';
import { ResourceEditModalComponent } from './resource-edit.modal';

export type ResourceListState = {
  searchTerm: string;
  selectedTag: string;
  selectedResourceType: ResourceType | typeof AllCategories;
  selectedBoatType: RowingBoatType| typeof AllCategories;
  selectedGender: GenderType | typeof AllCategories;
};

const initialState: ResourceListState = {
  searchTerm: '',
  selectedTag: '',
  selectedResourceType: AllCategories,
  selectedBoatType: AllCategories,
  selectedGender: AllCategories,
};

export const ResourceListStore = signalStore(
  withState(initialState),
  withProps(() => ({
    resourceService: inject(ResourceService),
    appNavigationService: inject(AppNavigationService),
    router: inject(Router),
    appStore: inject(AppStore),
    modalController: inject(ModalController),    
  })),
  withProps((store) => ({
    resourceResource: rxResource({
      loader: () => {
        return searchData<ResourceModel>(store.appStore.firestore, ResourceCollection, getSystemQuery(store.appStore.tenantId()), 'name', 'asc');
      }
    })
  })),

  withComputed((state) => {
    return {
      resources: computed(() => state.resourceResource.value() ?? []),
      resourcesCount: computed(() => state.resourceResource.value()?.length ?? 0), 
      filteredResources: computed(() => 
        state.resourceResource.value()?.filter((resource: ResourceModel) => 
          nameMatches(resource.index, state.searchTerm()) &&
          categoryMatches(resource.type, state.selectedResourceType()) &&
          chipMatches(resource.tags, state.selectedTag()))
      ),
      boats: computed(() => state.resourceResource.value()?.filter((resource: ResourceModel) => resource.type === ResourceType.RowingBoat) ?? []),
      lockers: computed(() => state.resourceResource.value()?.filter((resource: ResourceModel) => resource.type === ResourceType.Locker) ?? []),
      keys: computed(() => state.resourceResource.value()?.filter((resource: ResourceModel) => resource.type === ResourceType.Key) ?? []),
      currentUser: computed(() => state.appStore.currentUser()),
      tenantId: computed(() => state.appStore.tenantId()),
      isLoading: computed(() => state.resourceResource.isLoading()),
    };
  }),
  withComputed((state) => {
    return {
      boatsCount: computed(() => state.boats().length ?? 0), 
      filteredBoats: computed(() => 
        state.boats()?.filter((resource: ResourceModel) => 
          nameMatches(resource.index, state.searchTerm()) &&
          categoryMatches(resource.subType, state.selectedBoatType()) &&
          chipMatches(resource.tags, state.selectedTag()))
      ),
      lockersCount: computed(() => state.lockers().length ?? 0),
      filteredLockers: computed(() =>
        state.lockers()?.filter((resource: ResourceModel) =>
          nameMatches(resource.index, state.searchTerm()) &&
          categoryMatches(resource.subType, state.selectedGender()) &&
          chipMatches(resource.tags, state.selectedTag()))
      ),
      keysCount: computed(() => state.keys().length ?? 0),
      filteredKeys: computed(() =>
        state.keys()?.filter((resource: ResourceModel) =>
          nameMatches(resource.index, state.searchTerm()) &&
          chipMatches(resource.tags, state.selectedTag()))
      ),
    }
  }),

  withMethods((store) => {
    return {
      /******************************** setters (filter) ******************************************* */
      setSearchTerm(searchTerm: string) {
        patchState(store, { searchTerm });
      },

      setSelectedResourceType(selectedResourceType: ResourceType | typeof AllCategories) {
        patchState(store, { selectedResourceType });
      },

      setSelectedBoatType(selectedBoatType: RowingBoatType | typeof AllCategories) {
        patchState(store, { selectedBoatType });
      },

      setSelectedGender(selectedGender: GenderType | typeof AllCategories) {
        patchState(store, { selectedGender });
      },

      setSelectedTag(selectedTag: string) {
        patchState(store, { selectedTag });
      },

      /******************************** getters ******************************************* */
      getResourceTags(): string {
        return store.appStore.getTags(ModelType.Resource);
      },

      getLockerTags(): string {
        return store.appStore.getTags(parseInt(ModelType.Resource + '.' + ResourceType.Locker));
      },

      getKeyTags(): string {
        return store.appStore.getTags(parseInt(ModelType.Resource + '.' + ResourceType.Key));
      },
      
      getRowingBoatTags(): string {
        return store.appStore.getTags(parseInt(ModelType.Resource + '.' + ResourceType.RowingBoat));
      },

      /******************************** actions ******************************************* */
      async add(isTypeEditable = false): Promise<void> {
        const _resource = new ResourceModel(store.tenantId());
        const _modal = await store.modalController.create({
          component: ResourceEditModalComponent,
          componentProps: {
            resource: _resource,
            isTypeEditable: isTypeEditable
          }
        });
        _modal.present();
        const { data, role } = await _modal.onDidDismiss();
        if (role === 'confirm') {
          if (isResource(data, store.tenantId())) {
            await (!data.bkey ? 
              store.resourceService.create(data, store.currentUser()) : 
              store.resourceService.update(data, store.currentUser()));
          }
        }
        store.resourceResource.reload();
      },

      async edit(resource: ResourceModel, isTypeEditable = false): Promise<void> {
        store.appNavigationService.pushLink('/resource/all' );
        await navigateByUrl(store.router, `/resource/${resource.bkey}`, { isTypeEditable});
        store.resourceResource.reload();        
      },

      async delete(resource: ResourceModel): Promise<void> {
        await store.resourceService.delete(resource, store.currentUser());
        store.resourceResource.reload();
      },

      async export(type: string): Promise<void> {
        console.log(`ResourceListStore.export(${type}) is not yet implemented.`);
      }
    }
  }),
);
