import { Component, computed, input, model, output, signal } from '@angular/core';
import { IonAvatar, IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonImg, IonItem, IonLabel, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { CategoryComponent, ChipsComponent, DateInputComponent, NotesInputComponent, TextInputComponent } from '@bk2/shared/ui';
import { GenderType, ModelType, PersonalRelType, UserModel, RoleName } from '@bk2/shared/models';
import { debugFormErrors, hasRole } from '@bk2/shared/util-core';
import { AvatarPipe, FullNamePipe } from '@bk2/shared/pipes';
import { TranslatePipe } from '@bk2/shared/i18n';
import { PersonalRelTypes } from '@bk2/shared/categories';

import { AsyncPipe } from '@angular/common';

import { PersonalRelFormModel, personalRelFormModelShape, PersonalRelNewFormModel, personalRelNewFormValidations } from '@bk2/personal-rel/util';

@Component({
  selector: 'bk-personal-rel-new-form',
  imports: [
    vestForms,
    AvatarPipe, AsyncPipe, FullNamePipe, TranslatePipe,
    DateInputComponent, ChipsComponent, NotesInputComponent, CategoryComponent, TextInputComponent,
    IonGrid, IonRow, IonCol, IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonItem, IonAvatar, IonImg, IonLabel, IonButton
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
        <ion-card-title>Personen</ion-card-title>
      </ion-card-header>
      <ion-card-content>
        <ion-grid>
          <ion-row>
            <ion-col size="9">
              <ion-item lines="none">
                <ion-avatar slot="start">
                  <ion-img src="{{ modelType.Person + '.' + subjectKey() | avatar | async }}" alt="Avatar of first person" />
                </ion-avatar>
                <ion-label>{{ subjectFirstName() | fullName:subjectLastName() }}</ion-label>
              </ion-item>
            </ion-col>
            <ion-col size="3">
              <ion-item lines="none">
                <ion-button slot="start" fill="clear" (click)="selectPerson.emit(true)">{{ '@general.operation.select.label' | translate | async }}</ion-button>
              </ion-item>
            </ion-col>
          </ion-row>
          <ion-row>
            <ion-col size="12" size-md="6"> 
              <bk-cat name="type" [value]="type()" [categories]="personalRelTypes" (changed)="onChange('type', $event)" />
            </ion-col>
            @if(type() === personalRelType.Custom) {
              <ion-col size="12" size-md="6">
                  <bk-text-input name="label" [value]="label()" (changed)="onChange('label', $event)" />
              </ion-col>
            }
          </ion-row>
          <ion-row>
            <ion-col size="9">
              <ion-item lines="none">
                <ion-avatar slot="start">
                <ion-img src="{{ modelType.Person + '.' + objectKey() | avatar | async }}" alt="Avatar of second person" />
                </ion-avatar>
                <ion-label>{{ objectFirstName() | fullName:objectLastName() }}</ion-label>
              </ion-item>
            </ion-col>
            <ion-col size="3">
              <ion-item lines="none">
              <ion-button slot="start" fill="clear" (click)="selectPerson.emit(false)">{{ '@general.operation.select.label' | translate | async }}</ion-button>
              </ion-item>
            </ion-col>
          </ion-row>        
        </ion-grid>
      </ion-card-content>
    </ion-card>

    <ion-card>
      <ion-card-header>
        <ion-card-title>Beziehung</ion-card-title>
      </ion-card-header>
      <ion-card-content>
        <ion-grid>
          <ion-row>
            <ion-col size="12" size-md="6">
              <bk-date-input name="validFrom" [storeDate]="validFrom()" [showHelper]=true [readOnly]="readOnly()" (changed)="onChange('validFrom', $event)" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-date-input name="validTo" [storeDate]="validTo()" [showHelper]=true [readOnly]="readOnly()" (changed)="onChange('validTo', $event)" />
            </ion-col>
          </ion-row>
        </ion-grid>
      </ion-card-content>
    </ion-card>
      
    @if(hasRole('privileged')) {
      <bk-chips chipName="tag" [storedChips]="tags()" [allChips]="personalRelTags()" [readOnly]="readOnly()" (changed)="onChange('tags', $event)" />
    }

    @if(hasRole('admin')) {
      <bk-notes [value]="notes()" (changed)="onChange('notes', $event)" />
    }
  </form>
  `
})
export class PersonalRelNewFormComponent {
  public vm = model.required<PersonalRelNewFormModel>();
  public currentUser = input<UserModel | undefined>();
  public personalRelTags = input.required<string>();

  public selectPerson = output<boolean>();

  public readOnly = computed(() => !hasRole('memberAdmin', this.currentUser())); 
  protected subjectKey = computed(() => this.vm().subjectKey ?? '');
  protected subjectFirstName = computed(() => this.vm().subjectFirstName ?? ''); 
  protected subjectLastName = computed(() => this.vm().subjectLastName ?? ''); 
  protected subjectGender = computed(() => this.vm().subjectGender ?? GenderType.Male);

  protected objectKey = computed(() => this.vm().objectKey ?? '');
  protected objectFirstName = computed(() => this.vm().objectFirstName ?? ''); 
  protected objectLastName = computed(() => this.vm().objectLastName ?? ''); 
  protected objectGender = computed(() => this.vm().objectGender ?? GenderType.Male);

  protected type = computed(() => this.vm().type ?? PersonalRelType.Partner);
  protected label = computed(() => this.vm().label ?? '');
  protected validFrom = computed(() => this.vm().validFrom ?? '');
  protected validTo = computed(() => this.vm().validTo ?? '');
  protected tags = computed(() => this.vm().tags ?? '');
  protected notes = computed(() => this.vm().notes ?? '');

  public validChange = output<boolean>();
  protected dirtyChange = signal(false);
  
  protected readonly suite = personalRelNewFormValidations;
  protected readonly shape = personalRelFormModelShape;
  private readonly validationResult = computed(() => personalRelNewFormValidations(this.vm()));
  
  protected readonly modelType = ModelType;
  protected readonly personalRelTypes = PersonalRelTypes;
  protected readonly personalRelType = PersonalRelType;

  protected onValueChange(value: PersonalRelFormModel): void {
    this.vm.update((_vm) => ({..._vm, ...value}));
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }

  protected onChange(fieldName: string, $event: string | string[] | number): void {
    this.vm.update((vm) => ({ ...vm, [fieldName]: $event }));
    debugFormErrors('PersonalRelForm', this.validationResult().errors, this.currentUser());
    this.dirtyChange.set(true); // it seems, that vest is not updating dirty by itself for this change
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
