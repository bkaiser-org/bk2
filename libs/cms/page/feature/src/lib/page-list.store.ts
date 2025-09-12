import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { categoryMatches } from '@bk2/shared-categories';
import { AppStore } from '@bk2/shared-feature';
import { AllCategories, ModelType, PageModel } from '@bk2/shared-models';
import { chipMatches, debugListLoaded, nameMatches } from '@bk2/shared-util-core';

import { PageService } from '@bk2/cms-page-data-access';
import { isPage } from '@bk2/cms-page-util';
import { PageEditModalComponent } from './page-edit.modal';

export type PageList = {
  searchTerm: string;
  selectedTag: string;
  selectedType: number;
};

export const initialState: PageList = {
  searchTerm: '',
  selectedTag: '',
  selectedType: AllCategories
};

export const PageListStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    pageService: inject(PageService),
    modalController: inject(ModalController),    
  })),
  withProps((store) => ({
    pageResource: rxResource({
      stream: () => {
        const pages$ = store.pageService.list();
        debugListLoaded<PageModel>('PageListStore.pages', pages$, store.appStore.currentUser());
        return pages$;
      }
    })
  })),

  withComputed((state) => {
    return {
      pages: computed(() => state.pageResource.value()),
      pagesCount: computed(() => state.pageResource.value()?.length ?? 0), 
      filteredPages: computed(() => 
        state.pageResource.value()?.filter((page: PageModel) => 
          nameMatches(page.index, state.searchTerm()) &&
          categoryMatches(page.type, state.selectedType()) &&
          chipMatches(page.tags, state.selectedTag())
      )),   
      currentUser: computed(() => state.appStore.currentUser()),
      isLoading: computed(() => state.pageResource.isLoading()),
    };
  }),

  withMethods((store) => {
    return {
      /******************************** setters (filter) ******************************************* */
      setSearchTerm(searchTerm: string) {
        patchState(store, { searchTerm });
      },

      setSelectedTag(selectedTag: string) {
        patchState(store, { selectedTag });
      },

      setSelectedType(selectedType: number) {
        patchState(store, { selectedType });
      },

      /******************************** getters ******************************************* */
      getTags(): string {
        return store.appStore.getTags(ModelType.Page);
      },

      /******************************** actions ******************************************* */
      async add(): Promise<void> {
        await store.pageService.addPage(store.currentUser());
        store.pageResource.reload();
      },

      async delete(page: PageModel): Promise<void> {
        await store.pageService.delete(page, store.currentUser());
        store.pageResource.reload();
      },

      async edit(page: PageModel): Promise<void> {
        // we need to clone the page to avoid changing the original object (NG0100: ExpressionChangeAfterItHasBeenCheckedError)
        const _modal = await store.modalController.create({
          component: PageEditModalComponent,
          componentProps: {
            page: structuredClone(page),
            currentUser: store.currentUser()
          }
        });
        _modal.present();
        const { data, role } = await _modal.onWillDismiss();
        if (role === 'confirm') {
          if (isPage(data, store.appStore.tenantId())) {
            await store.pageService.update(data, store.currentUser());
            store.pageResource.reload();
          }
        }
      },

      async export(type: string): Promise<void> {
        console.log(`PageListStore.export(${type}) is not yet implemented.`);
      }
    }
  }),
);
