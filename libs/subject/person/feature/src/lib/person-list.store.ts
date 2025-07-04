import { patchState, signalStore, withComputed, withHooks, withMethods, withProps, withState } from '@ngrx/signals';
import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController, ToastController } from '@ionic/angular/standalone';
import { Router } from '@angular/router';
import { of } from 'rxjs';

import { chipMatches, createModel, debugListLoaded, hasRole, nameMatches } from '@bk2/shared/util-core';
import { AppNavigationService, confirmAction, copyToClipboardWithConfirmation, navigateByUrl } from '@bk2/shared/util-angular';
import { categoryMatches } from '@bk2/shared/categories';
import { AddressModel, AllCategories, GenderType, MembershipCollection, ModelType, PersonModel } from '@bk2/shared/models';
import { AppStore } from '@bk2/shared/feature';

import { CategoryService } from '@bk2/category/data-access';
import { AddressService } from '@bk2/address/data-access';
import { saveComment } from '@bk2/comment/util';

import { PersonService } from '@bk2/person/data-access';
import { convertFormToNewPerson, convertNewPersonFormToEmailAddress, convertNewPersonFormToMembership, convertNewPersonFormToPhoneAddress, convertNewPersonFormToPostalAddress, convertNewPersonFormToWebAddress, PersonNewFormModel } from '@bk2/person/util';
import { PersonNewModalComponent } from './person-new.modal';
import { bkTranslate } from '@bk2/shared/i18n';

export type PersonListState = {
  orgId: string;
  searchTerm: string;
  selectedTag: string;
  selectedGender: GenderType | typeof AllCategories;
};

export const initialState: PersonListState = {
  orgId: '',
  searchTerm: '',
  selectedTag: '',
  selectedGender: AllCategories,
};

export const PersonListStore = signalStore(
  withState(initialState),
  withProps(() => ({
    personService: inject(PersonService),
    addressService: inject(AddressService),
    categoryService: inject(CategoryService),
    appNavigationService: inject(AppNavigationService),
    router: inject(Router),
    appStore: inject(AppStore),
    modalController: inject(ModalController),
    toastController: inject(ToastController) 
  })),
  withProps((store) => ({
    personsResource: rxResource({
      loader: () => {
        const persons$ = store.personService.list();
        debugListLoaded('PersonListStore.persons$', persons$, store.appStore.currentUser());   
        return persons$;
      }
    }),
  })),

  withComputed((state) => {
    return {
      persons: computed(() => state.personsResource.value()),
      deceased: computed(() => state.personsResource.value()?.filter((person: PersonModel) => person.dateOfDeath !== undefined && person.dateOfDeath.length > 0) ?? []),
      showGender: computed(() => hasRole(state.appStore.privacySettings().showGender, state.appStore.currentUser())),
      currentUser: computed(() => state.appStore.currentUser()),
      tenantId: computed(() => state.appStore.tenantId()),
      membershipCategoryKey: computed(() => 'mcat_' + state.orgId()),
    };
  }),

  withProps((store) => ({
    mcatResource: rxResource({
      request: () => ({
        mcatId: store.membershipCategoryKey()
      }),  
      loader: ({request}) => {
        if (!request.mcatId || request.mcatId.length === 0) return of(undefined);
        return store.categoryService.read(request.mcatId);
      }
    }),
  })),
  withComputed((state) => {
    return {
      // all persons
      personsCount: computed(() => state.personsResource.value()?.length ?? 0), 
      filteredPersons: computed(() => 
        state.personsResource.value()?.filter((person: PersonModel) => 
          nameMatches(person.index, state.searchTerm()) &&
          categoryMatches(person.gender, state.selectedGender()) &&
          chipMatches(person.tags, state.selectedTag())) ?? []
      ),
      
      // deceased persons
      deceasedCount: computed(() => state.deceased().length ?? 0), 
      filteredDeceased: computed(() => 
        state.deceased()?.filter((person: PersonModel) => 
          nameMatches(person.index, state.searchTerm()) &&
          categoryMatches(person.gender, state.selectedGender()) &&
          chipMatches(person.tags, state.selectedTag())) ?? []
      ),
      membershipCategory: computed(() => state.mcatResource.value() ?? undefined),
      isLoading: computed(() => state.personsResource.isLoading() || state.mcatResource.isLoading()),
    }
  }),

  withMethods((store) => {
    return {
      reset() {
        patchState(store, initialState);
        store.personsResource.reload();
      },

      reload() {
        store.personsResource.reload();
      },
      
      /******************************** setters (filter) ******************************************* */
      setSearchTerm(searchTerm: string) {
        patchState(store, { searchTerm });
      },

      setSelectedGender(selectedGender: GenderType | typeof AllCategories) {
        patchState(store, { selectedGender });
      },

      setSelectedTag(selectedTag: string) {
        patchState(store, { selectedTag });
      },

      /******************************** getters ******************************************* */
      getTags(): string {
        return store.appStore.getTags(ModelType.Person);
      },

      /******************************* actions *************************************** */
      async add(): Promise<void> {
        const _modal = await store.modalController.create({
          component: PersonNewModalComponent
        });
        _modal.present();
        const { data, role } = await _modal.onWillDismiss();
        if (role === 'confirm') {
          const _vm = data as PersonNewFormModel;
          const _personKey = await store.personService.create(convertFormToNewPerson(_vm, store.tenantId()), store.currentUser());
          const _avatarKey = ModelType.Person + '.' + _personKey;
          if ((_vm.email ?? '').length > 0) {
            this.saveAddress(convertNewPersonFormToEmailAddress(_vm, store.tenantId()), _avatarKey);
          }
          if ((_vm.phone ?? '').length > 0) {
            this.saveAddress(convertNewPersonFormToPhoneAddress(_vm, store.tenantId()), _avatarKey);
          }
          if ((_vm.web ?? '').length > 0) {
            this.saveAddress(convertNewPersonFormToWebAddress(_vm, store.tenantId()), _avatarKey);
          }
          if ((_vm.city ?? '').length > 0) {
            this.saveAddress(convertNewPersonFormToPostalAddress(_vm, store.tenantId()), _avatarKey);
          }
          if (_vm.shouldAddMembership) {
            if ((_vm.orgKey ?? '').length > 0 && (_vm.membershipCategory ?? '').length > 0) {
              await this.saveMembership(_vm, _personKey);
            }
          }
        }
        store.personsResource.reload();
      },

      /**
       * Optionally add a membership to a person.
       * We do not want to use MembershipService.create() in order to avoid the dependency to the membership module
       * @param vm  the form data for a new person
       * @param personKey the key of the newly created person
       */
      async saveMembership(vm: PersonNewFormModel, personKey: string): Promise<string> {
        const _membership = convertNewPersonFormToMembership(vm, personKey, store.tenantId());
        try {
          _membership.index = 'mn:' + _membership.memberName1 + ' ' + _membership.memberName2 + ' mk:' + _membership.memberKey + ' ok:' + _membership.orgKey;
          const _key = await createModel(store.appStore.firestore, MembershipCollection, _membership, store.tenantId());
          await confirmAction(bkTranslate('@membership.operation.create.conf'), true, store.toastController);
          await saveComment(store.appStore.firestore, store.tenantId(), store.currentUser(), MembershipCollection, _key, '@comment.operation.initial.conf');
          return _key;    
        }
        catch (error) {
          await confirmAction(bkTranslate('@membership.operation.create.error'), true, store.toastController);
          throw error; // rethrow the error to be handled by the caller
        }
      },

      saveAddress(address: AddressModel, avatarKey: string): void {
        address.parentKey = avatarKey;
        store.addressService.create(address, store.currentUser());
      },

      async export(type: string): Promise<void> {
        console.log(`PersonListStore.export(${type}) ist not yet implemented`);
      },

      async edit(person: PersonModel): Promise<void> {
        store.appNavigationService.pushLink('/person/all' );
        await navigateByUrl(store.router, `/person/${person.bkey}`);
        store.personsResource.reload();
      },

      async delete(person: PersonModel): Promise<void> {
        await store.personService.delete(person, store.currentUser());
        this.reset();
      },

      async copyEmailAddresses(): Promise<void> {
        const _allEmails = store.filteredPersons().map(_person => _person.fav_email);
        const _emails = _allEmails.filter(e => e); // this filters all empty emails, because '' is a falsy value
        await copyToClipboardWithConfirmation(store.toastController, _emails.toString() ?? '', '@subject.address.operation.emailCopy.conf');
      }
    }
  }),

  withHooks({
    onInit(store) {
      patchState(store, { orgId: store.tenantId() });
    }
  })
);
