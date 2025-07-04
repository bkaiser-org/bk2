import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';
import { AsyncPipe } from '@angular/common';

import { TranslatePipe } from '@bk2/shared/i18n';
import { ChangeConfirmationComponent, HeaderComponent } from '@bk2/shared/ui';
import { ModelType, UserModel} from '@bk2/shared/models';
import { AppStore } from '@bk2/shared/feature';

import { GroupNewFormComponent } from '@bk2/group/ui';
import { createNewGroupFormModel } from '@bk2/group/util';

@Component({
  selector: 'bk-group-new-modal',
  imports: [
    TranslatePipe, AsyncPipe,
    HeaderComponent, ChangeConfirmationComponent, GroupNewFormComponent,
    IonContent
  ],
  template: `
    <bk-header title="{{ '@subject.group.operation.create.label' | translate | async }}" [isModal]="true" />
    @if(formIsValid()) {
      <bk-change-confirmation (okClicked)="save()" />
    }
    <ion-content>
      <bk-group-new-form [(vm)]="vm" [currentUser]="currentUser()" [groupTags]="groupTags()" (validChange)="onValidChange($event)" />
    </ion-content>
  `
})
export class GroupNewModalComponent {
  private readonly modalController = inject(ModalController);
  private readonly appStore = inject(AppStore);

  public currentUser = input<UserModel | undefined>();

  public vm = linkedSignal(() => createNewGroupFormModel());
  protected readonly groupTags = computed(() => this.appStore.getTags(ModelType.Group));

  protected formIsValid = signal(false);

  public async save(): Promise<boolean> {
    return this.modalController.dismiss(this.vm(), 'confirm');
  }

  protected onValidChange(valid: boolean): void {
    this.formIsValid.set(valid);
  }
}
