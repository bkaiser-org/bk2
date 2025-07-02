import { enforce, omitWhen, only, staticSuite, test} from 'vest';

import { categoryValidations, dateValidations, isAfterDate, isFutureDate, stringValidations } from '@bk2/shared/util-core';
import { CITY_LENGTH, COUNTRY_LENGTH, DESCRIPTION_LENGTH, EMAIL_LENGTH, PHONE_LENGTH, SHORT_NAME_LENGTH, ZIP_LENGTH } from '@bk2/shared/constants';
import { GenderType } from '@bk2/shared/models';

import { ssnValidations } from './ssn.validations';
import { PersonNewFormModel } from './person-new-form.model';

export const personNewFormValidations = staticSuite((model: PersonNewFormModel, field?: string) => {
  if (field) only(field);

  stringValidations('firstName', model.firstName, SHORT_NAME_LENGTH);
  stringValidations('lastName', model.lastName, SHORT_NAME_LENGTH, 4, true);
  categoryValidations('gender', model.gender, GenderType);
  dateValidations('dateOfBirth', model.dateOfBirth);
  dateValidations('dateOfDeath', model.dateOfDeath);
  ssnValidations('ssn', model.ssnId);
  stringValidations('bexioId', model.bexioId, SHORT_NAME_LENGTH);

  stringValidations('street', model.street, SHORT_NAME_LENGTH);
  stringValidations('zipCode', model.zipCode, ZIP_LENGTH);
  stringValidations('city', model.city, CITY_LENGTH);
  stringValidations('countryCode', model.countryCode, COUNTRY_LENGTH);
  stringValidations('phone', model.phone, PHONE_LENGTH);
  stringValidations('email', model.email, EMAIL_LENGTH);
  stringValidations('web', model.web, SHORT_NAME_LENGTH);

  stringValidations('orgKey', model.orgKey, SHORT_NAME_LENGTH);
  stringValidations('orgName', model.orgName, SHORT_NAME_LENGTH);
  stringValidations('membershipCategory', model.membershipCategory, SHORT_NAME_LENGTH);
  stringValidations('membershipCategoryAbbreviation', model.membershipCategoryAbbreviation, 2);
  dateValidations('dateOfEntry', model.dateOfEntry);

  stringValidations('notes', model.notes, DESCRIPTION_LENGTH);
  //tagValidations('tags', model.tags);

  // cross field validations
  omitWhen(model.dateOfBirth === '', () => {
    test('dateOfBirth', '@personDateOfBirthNotFuture', () => {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      enforce(isFutureDate(model.dateOfBirth!)).isFalsy();
    })
  });

  omitWhen(model.dateOfDeath === '', () => {
    test('dateOfDeath', '@personDateOfDeathNotFuture', () => {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      enforce(isFutureDate(model.dateOfDeath!)).isFalsy();
    })
  });

  omitWhen(model.dateOfDeath === '' || model.dateOfBirth === '', () => {
    test('dateOfDeath', '@personDateOfDeathAfterBirth', () => {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      enforce(isAfterDate(model.dateOfDeath!, model.dateOfBirth!)).isTruthy();
    });
  })
  // cross collection validations
});

