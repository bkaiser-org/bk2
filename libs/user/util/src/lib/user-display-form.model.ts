import { DeepRequired } from 'ngx-vest-forms';

import { AvatarUsage, Language, NameDisplay, PersonSortCriteria } from '@bk2/shared-models';

export type UserDisplayFormModel = {
  avatarUsage: AvatarUsage;
  personSortCriteria: PersonSortCriteria;
  userLanguage: Language;
  nameDisplay: NameDisplay;
  useDisplayName: boolean;
  showArchivedData: boolean;
  showDebugInfo: boolean;
  showHelpers: boolean;
};

export const userDisplayFormModelShape: DeepRequired<UserDisplayFormModel> = {
  avatarUsage: AvatarUsage.PhotoFirst,
  personSortCriteria: PersonSortCriteria.Lastname,
  userLanguage: Language.GE,
  nameDisplay: NameDisplay.FirstLast,
  useDisplayName: false,
  showArchivedData: false,
  showDebugInfo: false,
  showHelpers: true,
};
