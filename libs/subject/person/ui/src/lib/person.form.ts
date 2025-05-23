import { Component, computed, inject, input, model, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { GenderTypes } from '@bk2/shared/categories';
import { BexioIdMask, ChSsnMask, ENV, RoleName } from '@bk2/shared/config';
import { GenderType, UserModel } from '@bk2/shared/models';
import { CategoryComponent, ChipsComponent, DateInputComponent, NotesInputComponent, TextInputComponent } from '@bk2/shared/ui';
import { debugFormErrors, hasRole } from '@bk2/shared/util';
import { PersonFormModel, personFormModelShape, personFormValidations } from '@bk2/person/util';

@Component({
  selector: 'bk-person-form',
  imports: [
    vestForms,
    FormsModule,
    TextInputComponent, DateInputComponent, CategoryComponent, ChipsComponent, NotesInputComponent,
    IonGrid, IonRow, IonCol, IonCard, IonCardTitle, IonCardHeader, IonCardContent
  ],  
  template: `
    <form scVestForm
    [formShape]="shape"
    [formValue]="vm()"
    [suite]="suite" 
    (dirtyChange)="dirtyChange.set($event)"
    (formValueChange)="onValueChange($event)">
      <ion-card>
        <ion-card-header>
          <ion-card-title>Angaben zur Person</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
              <ion-row> 
                <ion-col size="12" size-md="6">
                  <bk-text-input name="firstName" [value]="firstName()" autocomplete="given-name" [autofocus]="true" [maxLength]=30 [readOnly]="readOnly()" (changed)="onChange('firstName', $event)" />                                        
                </ion-col>

                <ion-col size="12" size-md="6">
                  <bk-text-input name="lastName" [value]="lastName()" autocomplete="family-name" [maxLength]=30 [readOnly]="readOnly()" (changed)="onChange('lastName', $event)" />                                        
                </ion-col>
              </ion-row>

                <!-- tbd: these role checks are currently only checking against the default
                they need to be extended to consider the settings of this person's user -->
                @if(hasRole(env.privacy.showDateOfBirth) || hasRole(env.privacy.showDateOfDeath)) {
                  <ion-row>
                    @if(hasRole(env.privacy.showDateOfBirth)) {
                      <ion-col size="12" size-md="6"> 
                        <bk-date-input name="dateOfBirth" [storeDate]="dateOfBirth()" autocomplete="bday" [showHelper]=true [readOnly]="readOnly()" (changed)="onChange('dateOfBirth', $event)" />
                      </ion-col>
                    }

                    @if(hasRole(env.privacy.showDateOfDeath)) {
                      <ion-col size="12" size-md="6">
                        <bk-date-input name="dateOfDeath"  [storeDate]="dateOfDeath()" [readOnly]="readOnly()" (changed)="onChange('dateOfDeath', $event)" />
                      </ion-col>
                    }
                  </ion-row>
                }

              <ion-row>
                @if(hasRole(env.privacy.showGender)) {
                  <ion-col size="12" size-md="6">
                    <bk-cat name="gender" [value]="gender()" [categories]="genderTypes" [readOnly]="readOnly()" (changed)="onChange('gender', $event)" />
                  </ion-col>
                }
        
                @if(hasRole(env.privacy.showTaxId)) {
                  <ion-col size="12" size-md="6">
                    <bk-text-input name="ssnId" [value]="ssnId()" [maxLength]=16 [mask]="ssnMask" [showHelper]=true [copyable]=true [readOnly]="readOnly()" (changed)="onChange('ssnId', $event)" />                                        
                  </ion-col>
                }
                @if(hasRole(env.privacy.showBexioId)) {
                  <ion-col size="12" size-md="6">
                    <bk-text-input name="bexioId" [value]="bexioId()" [maxLength]=6 [mask]="bexioMask" [showHelper]=true [readOnly]="readOnly()" (changed)="onChange('bexioId', $event)" />                                        
                  </ion-col>
                }
              </ion-row>
              </ion-grid>
          </ion-card-content>
        </ion-card>

        @if(hasRole(env.privacy.showTags)) {
          <bk-chips chipName="tag" [storedChips]="tags()" [allChips]="personTags()" [readOnly]="readOnly()" (changed)="onChange('tags', $event)" />
        }
        
        @if(hasRole(env.privacy.showNotes)) {
          <bk-notes [value]="notes()" (changed)="onChange('notes', $event)" />
        }
      </form>
  `
})
export class PersonFormComponent {  
  protected readonly env = inject(ENV);
  public vm = model.required<PersonFormModel>();
  public currentUser = input<UserModel | undefined>();
  public personTags = input.required<string>();
  
  public validChange = output<boolean>();
  protected dirtyChange = signal(false);

  public readOnly = computed(() => !hasRole('memberAdmin', this.currentUser()));
  protected firstName = computed(() => this.vm().firstName ?? '');
  protected lastName = computed(() => this.vm().lastName ?? '');
  protected dateOfBirth = computed(() => this.vm().dateOfBirth ?? '');
  protected dateOfDeath = computed(() => this.vm().dateOfDeath ?? '');
  protected gender = computed(() => this.vm().gender ?? GenderType.Male);
  protected ssnId = computed(() => this.vm().ssnId ?? '');
  protected bexioId = computed(() => this.vm().bexioId ?? '');
  protected tags = computed(() => this.vm().tags ?? '');
  protected notes = computed(() => this.vm().notes ?? '');

  protected readonly suite = personFormValidations;
  protected readonly shape = personFormModelShape;
  private readonly validationResult = computed(() => personFormValidations(this.vm()));
  protected lastNameErrors = computed(() => this.validationResult().getErrors('lastName'));

  protected GT = GenderType;
  protected genderTypes = GenderTypes;
  protected bexioMask = BexioIdMask;
  protected ssnMask = ChSsnMask;

  protected onValueChange(value: PersonFormModel): void {
    this.vm.update((_vm) => ({..._vm, ...value}));
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }

  protected onChange(fieldName: string, $event: string | string[] | number): void {
    this.vm.update((vm) => ({ ...vm, [fieldName]: $event }));
    debugFormErrors('PersonForm', this.validationResult().errors, this.currentUser());
    this.dirtyChange.set(true); // it seems, that vest is not updating dirty by itself for this change
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
