import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';

import { AvatarInfo, ModelType } from '@bk2/shared/models';
import { createFullName, debugItemLoaded } from '@bk2/shared/util-core';
import { AppStore } from '@bk2/shared/feature';
import { getAvatarImgixUrl } from '@bk2/shared/pipes';
import { THUMBNAIL_SIZE } from '@bk2/shared/constants';

export type TaskEditState = {
  author: AvatarInfo | undefined;
  assignee: AvatarInfo | undefined;
  scope: AvatarInfo | undefined;
};

export const initialState: TaskEditState = {
  author: undefined,
  assignee: undefined,
  scope: undefined,
};

export const TaskEditStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
  })),
  withProps((store) => ({
    authorResource: rxResource({
      request: () => ({
        author: store.author(),
        currentUser: store.appStore.currentUser()
      }),  
      loader: ({request}) => {
        const _key = request.author?.key + '.' + request.author?.modelType;
        const author$ = getAvatarImgixUrl(store.appStore.firestore, _key, THUMBNAIL_SIZE, store.appStore.services.imgixBaseUrl());
        debugItemLoaded<string>(`authorUrl `, author$, request.currentUser);
        return author$;
      }
    }),

    assigneeResource: rxResource({
      request: () => ({
        assignee: store.assignee(),
        currentUser: store.appStore.currentUser()
      }),  
      loader: ({request}) => {
        const _key = request.assignee?.key + '.' + request.assignee?.modelType;
        const assignee$ = getAvatarImgixUrl(store.appStore.firestore, _key, THUMBNAIL_SIZE, store.appStore.services.imgixBaseUrl());
        debugItemLoaded<string>(`assigneeUrl `, assignee$, request.currentUser);
        return assignee$;
      }
    }),

    scopeResource: rxResource({
      request: () => ({
        scope: store.scope(),
        currentUser: store.appStore.currentUser()
      }),  
      loader: ({request}) => {
        const _key = request.scope?.key + '.' + request.scope?.modelType;
        const scope$ = getAvatarImgixUrl(store.appStore.firestore, _key, THUMBNAIL_SIZE, store.appStore.services.imgixBaseUrl());
        debugItemLoaded<string>(`scopeUrl `, scope$, request.currentUser);
        return scope$;
      }
    })
  })),

  withComputed((state) => {
    return {
      authorUrl: computed(() => state.authorResource.value() ?? ''),
      authorName: computed(() => createFullName(state.author()?.name1 ?? '', state.author()?.name2 ?? '')),
      assigneeUrl: computed(() => state.assigneeResource.value() ?? ''),
      assigneeName: computed(() => createFullName(state.assignee()?.name1 ?? '', state.assignee()?.name2 ?? '')),
      scopeUrl: computed(() => state.scopeResource.value() ?? ''),
      scopeName: computed(() => createFullName(state.scope()?.name1 ?? '', state.scope()?.name2 ?? '')),
      isLoading: computed(() => state.authorResource.isLoading() || state.assigneeResource.isLoading() || state.scopeResource.isLoading()),

      tags: computed(() => state.appStore.getTags(ModelType.Task)),
      tenantId: computed(() => state.appStore.tenantId()),
      currentUser: computed(() => state.appStore.currentUser()),
    };
  }),

  withMethods((store) => {
    return {
      /******************************** setters ******************************************* */
      setAuthor(author: AvatarInfo | undefined): void {
        patchState(store, { author });
      },
      setAssignee(assignee: AvatarInfo | undefined): void {
        patchState(store, { assignee });
      },
      setScope(scope: AvatarInfo | undefined): void {
        patchState(store, { scope });
      },
      /******************************** getters ******************************************* */

    };
  }),
);

