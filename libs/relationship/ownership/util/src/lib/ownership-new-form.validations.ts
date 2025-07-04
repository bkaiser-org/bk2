import { ABBREVIATION_LENGTH, CURRENCY_LENGTH, SHORT_NAME_LENGTH } from '@bk2/shared/constants';
import { AccountType, GenderType, ModelType, OrgType, Periodicity, ResourceType, RowingBoatType } from '@bk2/shared/models';
import { categoryValidations, dateValidations, isAfterDate, numberValidations, stringValidations } from '@bk2/shared/util-core';
import { enforce, omitWhen, only, staticSuite, test} from 'vest';
import { OwnershipNewFormModel } from './ownership-new-form.model';


export const ownershipNewFormValidations = staticSuite((model: OwnershipNewFormModel, field?: string) => {
  if (field) only(field);

  stringValidations('ownerKey', model.ownerKey, SHORT_NAME_LENGTH);
  stringValidations('ownerName1', model.ownerName1, SHORT_NAME_LENGTH);
  stringValidations('ownerName2', model.ownerName2, SHORT_NAME_LENGTH);

  // tbd: test ownerModelType to be either Person or Org
  omitWhen(model.ownerModelType !== ModelType.Person, () => {
    categoryValidations('ownerType', model.ownerType, GenderType); 
  });
  omitWhen(model.ownerModelType !== ModelType.Org, () => {
    categoryValidations('ownerType', model.ownerType, OrgType); 
  });
    
  stringValidations('resourceKey', model.resourceKey, SHORT_NAME_LENGTH);
  stringValidations('resourceName', model.resourceName, SHORT_NAME_LENGTH);
  // tbd: test resourceModelType to be either Resource or Account

  omitWhen(model.resourceModelType !== ModelType.Account, () => {
    categoryValidations('resourceType', model.resourceType, AccountType); 
  });
  omitWhen(model.resourceModelType !== ModelType.Resource, () => {
    categoryValidations('resourceType', model.resourceType, ResourceType); 
  });
  omitWhen(model.resourceType !== ResourceType.RowingBoat, () => {
    categoryValidations('resourceSubType', model.resourceSubType, RowingBoatType); 
  });

  dateValidations('validFrom', model.validFrom);
  dateValidations('validTo', model.validTo);

   // cross field validations
   omitWhen(model.validFrom === '' || model.validTo === '', () => {
    test('validTo', '@ownershipValidToAfterValidFrom', () => {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      enforce(isAfterDate(model.validTo!, model.validFrom!)).isTruthy();
    });
  });
  stringValidations('ownershipCategory', model.ownershipCategory, SHORT_NAME_LENGTH, 3, true);
  stringValidations('ownershipState', model.ownershipState, SHORT_NAME_LENGTH, 3, true);

  stringValidations('count', model.count, ABBREVIATION_LENGTH);
  numberValidations('priority', model.priority, true, 0, 100);

  numberValidations('price', model.price);
  stringValidations('currency', model.currency, CURRENCY_LENGTH);
  categoryValidations('periodicity', model.periodicity, Periodicity);
});
