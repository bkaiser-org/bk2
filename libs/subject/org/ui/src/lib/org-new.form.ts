import { Component, computed, inject, input, model, output, signal} from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow, ModalController } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { OrgTypes } from '@bk2/shared/categories';
import { BexioIdMask, ChVatMask, RoleName } from '@bk2/shared/config';
import { OrgType, SwissCity, UserModel } from '@bk2/shared/models';
import { CategoryComponent, ChipsComponent, DateInputComponent, EmailInputComponent, ErrorNoteComponent, NotesInputComponent, PhoneInputComponent, TextInputComponent } from '@bk2/shared/ui';
import { debugFormErrors, hasRole } from '@bk2/shared/util';

import { SwissCitySearchComponent } from '@bk2/swisscities/ui';

import { OrgFormModel, OrgNewFormModel, orgNewFormModelShape, orgNewFormValidations } from '@bk2/org/util';

@Component({
  selector: 'bk-org-new-form',
  imports: [
    vestForms,
    CategoryComponent, DateInputComponent, TextInputComponent, ChipsComponent, NotesInputComponent, ErrorNoteComponent,
    EmailInputComponent, PhoneInputComponent, SwissCitySearchComponent,
    IonGrid, IonRow, IonCol, IonCard, IonCardContent
  ],
  template: `
  <form scVestForm
    [formShape]="shape"
    [formValue]="vm()"
    [suite]="suite" 
    (dirtyChange)="dirtyChange.set($event)"
    (formValueChange)="onValueChange($event)">

    <ion-card>
      <ion-card-content>
        <ion-grid>
          <!---------------------------------------------------
          ORGANISATION 
          --------------------------------------------------->
          @if (isOrgTypeVisible()) {
            <ion-row>
              <ion-col size="12" size-md="6">
                <bk-cat name="orgType" [value]="orgType()" [categories]="orgTypes" [readOnly]="isOrgTypeReadOnly() || readOnly()" (changed)="onChange('type', $event)" />
              </ion-col>
            </ion-row>
          }

          <ion-row> 
            <ion-col size="12">
              <bk-text-input name="orgName" [value]="orgName()" autocomplete="organization" [maxLength]=50 [readOnly]="readOnly()" (changed)="onChange('orgName', $event)" />
              <bk-error-note [errors]="orgNameErrors()" />                                                                                                                     
            </ion-col>
          </ion-row>

          <ion-row>
            <ion-col size="12" size-md="6">
              <bk-date-input name="dateOfFoundation" [storeDate]="dateOfFoundation()" [showHelper]=true [readOnly]="readOnly()" (changed)="onChange('dateOfFoundation', $event)" />
            </ion-col>
    
            <ion-col size="12" size-md="6">
              <bk-date-input name="dateOfLiquidation" [storeDate]="dateOfLiquidation()" [showHelper]=true [readOnly]="readOnly()" (changed)="onChange('dateOfLiquidation', $event)" />
            </ion-col>
          </ion-row>

          <!---------------------------------------------------
          ADDRESSES  
          --------------------------------------------------->
          <ion-row>
            <ion-col size="12">
              <bk-text-input name="street" [value]="street()" autocomplete="street-address" (changed)="onChange('street', $event)" />
              <bk-error-note [errors]="streetErrors()" />                                                                                                                     
            </ion-col>
          </ion-row>

          <bk-swisscity-search (citySelected)="onCitySelected($event)" />

          <ion-row>
            <ion-col size="12" size-md="3">
              <bk-text-input name="countryCode" [value]="countryCode()" (changed)="onChange('countryCode', $event)" />
            </ion-col>
    
            <ion-col size="12" size-md="3">
              <bk-text-input name="zipCode" [value]="zipCode()" (changed)="onChange('zipCode', $event)" />
            </ion-col>
            
            <ion-col size="12" size-md="6">
              <bk-text-input name="city" [value]="city()" (changed)="onChange('city', $event)" />
            </ion-col>
          </ion-row>
          <ion-row>
            <ion-col size="12" size-md="6"> 
              <bk-phone [value]="phone()" (changed)="onChange('phone', $event)" />
              <bk-error-note [errors]="phoneErrors()" />                                                                                                                     
            </ion-col>
            <ion-col size="12">
              <bk-email [value]="email()" (changed)="onChange('email', $event)" />
              <bk-error-note [errors]="emailErrors()" />                                                                                                                     
            </ion-col>
            <ion-col size="12">
              <bk-text-input name="web" [value]="web()" (changed)="onChange('web', $event)" />
              <bk-error-note [errors]="webErrors()" />                                                                                                                     
            </ion-col>
          </ion-row>
          <ion-row>
            <ion-col size="12" size-md="6">
              <bk-text-input name="taxId" [value]="taxId()" [mask]="vatMask" [showHelper]=true [readOnly]="readOnly()" (changed)="onChange('taxId', $event)" />
            </ion-col>
          </ion-row>
          @if(hasRole('admin')) {
            <ion-row>
              <ion-col size="12">
                <bk-text-input name="bexioId" [value]="bexioId()" [maxLength]=6 [mask]="bexioMask" [showHelper]=true [readOnly]="readOnly()" (changed)="onChange('bexioId', $event)" />                                        
              </ion-col>
            </ion-row>
          }
        </ion-grid>
      </ion-card-content>
    </ion-card>

    <bk-chips chipName="tag" [storedChips]="tags()" [allChips]="orgTags()" [readOnly]="readOnly()" (changed)="onChange('tags', $event)" />

    @if(hasRole('admin')) { 
      <bk-notes name="notes" [value]="notes()" />
    }
  </form>
  `
})
export class OrgNewFormComponent {
  private readonly modalController = inject(ModalController)
  public vm = model.required<OrgNewFormModel>();
  public currentUser = input<UserModel | undefined>();
  public isOrgTypeReadOnly = input(false);
  public isOrgTypeVisible = input(true);
  public orgTags = input.required<string>();

  public readOnly = computed(() => !hasRole('memberAdmin', this.currentUser()));  

  public validChange = output<boolean>();
  protected dirtyChange = signal(false);
  
  protected readonly suite = orgNewFormValidations;
  protected readonly shape = orgNewFormModelShape;

  protected orgType = computed(() => this.vm().type ?? OrgType.Association);
  protected orgName = computed(() => this.vm().orgName ?? '');
  protected dateOfFoundation = computed(() => this.vm().dateOfFoundation ?? '');
  protected dateOfLiquidation = computed(() => this.vm().dateOfLiquidation ?? '');

  protected street = computed(() => this.vm().street ?? '');
  protected zipCode = computed(() => this.vm().zipCode ?? '');
  protected city = computed(() => this.vm().city ?? '');
  protected countryCode = computed(() => this.vm().countryCode ?? '');
  protected phone = computed(() => this.vm().phone ?? '');
  protected email = computed(() => this.vm().email ?? '');
  protected web = computed(() => this.vm().web ?? '');

  protected taxId = computed(() => this.vm().taxId ?? '');
  protected bexioId = computed(() => this.vm().bexioId ?? '');
  protected tags = computed(() => this.vm().tags ?? '');
  protected notes = computed(() => this.vm().notes ?? '');

  private readonly validationResult = computed(() => orgNewFormValidations(this.vm()));
  protected orgNameErrors = computed(() => this.validationResult().getErrors('orgName'));
  protected streetErrors = computed(() => this.validationResult().getErrors('street'));
  protected phoneErrors = computed(() => this.validationResult().getErrors('phone'));
  protected emailErrors = computed(() => this.validationResult().getErrors('email'));
  protected webErrors = computed(() => this.validationResult().getErrors('web'));

  public orgTypeEnum = OrgType;
  public orgTypes = OrgTypes;
  protected bexioMask = BexioIdMask;
  protected vatMask = ChVatMask;

  protected onCitySelected(city: SwissCity): void {
    this.vm.update((_vm) => ({ ..._vm, city: city.name, countryCode: city.countryCode, zipCode: String(city.zipCode) }));
  }

  protected onValueChange(value: OrgFormModel): void {
    this.vm.update((_vm) => ({..._vm, ...value}));
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }

  protected onChange(fieldName: string, $event: string | string[] | number): void {
    this.vm.update((vm) => ({ ...vm, [fieldName]: $event }));
    debugFormErrors('OrgNewForm', this.validationResult().errors, this.currentUser());
    this.dirtyChange.set(true); // it seems, that vest is not updating dirty by itself for this change
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
