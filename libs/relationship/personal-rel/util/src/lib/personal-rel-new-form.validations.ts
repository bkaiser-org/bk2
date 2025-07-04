import { DESCRIPTION_LENGTH, SHORT_NAME_LENGTH } from '@bk2/shared/constants';
import { categoryValidations, dateValidations, isAfterOrEqualDate, stringValidations } from '@bk2/shared/util-core';
import { enforce, omitWhen, only, staticSuite, test} from 'vest';
import { PersonalRelNewFormModel } from './personal-rel-new-form.model';
import { GenderType, PersonalRelType } from '@bk2/shared/models';


export const personalRelNewFormValidations = staticSuite((model: PersonalRelNewFormModel, field?: string) => {
  if (field) only(field);

  //tagValidations('tags', model.tags);
  stringValidations('notes', model.notes, DESCRIPTION_LENGTH);

  // subject
  stringValidations('subjectKey', model.subjectKey, SHORT_NAME_LENGTH);
  stringValidations('subjectFirstName', model.subjectFirstName, SHORT_NAME_LENGTH);
  stringValidations('subjectLastName', model.subjectLastName, SHORT_NAME_LENGTH);
  categoryValidations('subjectGender', model.subjectGender, GenderType);

  // object
  stringValidations('objectKey', model.objectKey, SHORT_NAME_LENGTH);
  stringValidations('objectFirstName', model.objectFirstName, SHORT_NAME_LENGTH);
  stringValidations('objectLastName', model.objectLastName, SHORT_NAME_LENGTH);
  categoryValidations('objectGender', model.objectGender, GenderType);
  
  categoryValidations('type', model.type, PersonalRelType);
  dateValidations('validFrom', model.validFrom);
  dateValidations('validTo', model.validTo);

   // cross field validations
  omitWhen(model.validFrom === '' || model.validTo === '', () => {
    test('validTo', '@personalRelValidToAfterValidTo', () => {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      enforce(isAfterOrEqualDate(model.validTo!, model.validFrom!)).isTruthy();
    });
  });
});





